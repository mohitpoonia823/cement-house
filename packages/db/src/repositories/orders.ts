import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'
import { adjustMaterialLocationStock, resolveSourceLocationId } from './multi-location'
import { postSaleVoucher, postCustomerReceiptVoucher, deleteOrderJournalEntries } from './accounting'

const ORDER_TX_MAX_WAIT_MS = 10_000
const ORDER_TX_TIMEOUT_MS = 120_000

export interface OrderListItemRow {
  id: string
  orderNumber: string
  invoiceNumber: string | null
  customerId: string
  referralPartnerId: string | null
  referralRewardAmount: number | null
  referralRewardRate: number | null
  createdById: string
  orderDate: Date
  deliveryDate: Date | null
  status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
  paidAmount: number
  dueAmount: number
  grandTotal: number
  totalAmount: number
  marginPct: number | null
  notes: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
  businessId: string
  customer: { name: string }
  referralPartner: { id: string; name: string; role: string } | null
  items: Array<{
    id: string
    orderId: string
    materialId: string
    variantId?: string | null
    quantity: number
    unitPrice: number
    purchasePrice: number
    lineTotal: number
  }>
}

export interface OrderDetailRow {
  id: string
  orderNumber: string
  invoiceNumber: string | null
  customerId: string
  referralPartnerId: string | null
  referralRewardAmount: number | null
  referralRewardRate: number | null
  createdById: string
  orderDate: Date
  deliveryDate: Date | null
  status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
  paidAmount: number
  dueAmount: number
  grandTotal: number
  totalAmount: number
  marginPct: number | null
  notes: string | null
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
  businessId: string
  customer: any
  referralPartner: { id: string; name: string; role: string } | null
  items: any[]
  deliveries: any[]
}

export interface OrderChallanRow {
  id: string
  orderNumber: string
  invoiceNumber: string | null
  createdAt: Date
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
  totalAmount: number
  customer: any
  items: any[]
  deliveries: any[]
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

export async function listOrders(input: {
  businessId: string
  page: number
  pageSize: number
  status?: string
  customerId?: string
}) {
  const where: Prisma.Sql[] = [Prisma.sql`o."businessId" = ${input.businessId}`, Prisma.sql`o."isDeleted" = false`]
  if (input.status) where.push(Prisma.sql`o.status = ${input.status}::"OrderStatus"`)
  if (input.customerId) where.push(Prisma.sql`o."customerId" = ${input.customerId}`)

  const skip = (input.page - 1) * input.pageSize

  const [orders, totalRows] = await Promise.all([
    prisma.$queryRaw<Array<Omit<OrderListItemRow, 'items'> & { items: unknown }>>(Prisma.sql`
      SELECT
        o.id,
        o."orderNumber" AS "orderNumber",
        o."invoiceNumber" AS "invoiceNumber",
        o."customerId" AS "customerId",
        o."referralPartnerId" AS "referralPartnerId",
        o."referralRewardAmount"::double precision AS "referralRewardAmount",
        o."referralRewardRate"::double precision AS "referralRewardRate",
        o."createdById" AS "createdById",
        o."orderDate" AS "orderDate",
        o."deliveryDate" AS "deliveryDate",
        o.status::text AS status,
        o."paymentMode"::text AS "paymentMode",
        o."amountPaid"::double precision AS "amountPaid",
        COALESCE(o."paidAmount", o."amountPaid")::double precision AS "paidAmount",
        COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid")))::double precision AS "dueAmount",
        COALESCE(o."grandTotal", o."totalAmount")::double precision AS "grandTotal",
        o."totalAmount"::double precision AS "totalAmount",
        o."marginPct"::double precision AS "marginPct",
        o.notes,
        o."isDeleted" AS "isDeleted",
        o."createdAt" AS "createdAt",
        o."updatedAt" AS "updatedAt",
        o."businessId" AS "businessId",
        json_build_object('name', c.name) AS customer,
        CASE
          WHEN rp.id IS NULL THEN NULL
          ELSE json_build_object('id', rp.id, 'name', rp.name, 'role', rp.role)
        END AS "referralPartner",
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', oi.id,
              'orderId', oi."orderId",
              'materialId', oi."materialId",
              'variantId', oi."variantId",
              'quantity', oi.quantity::double precision,
              'unitPrice', oi."unitPrice"::double precision,
              'purchasePrice', oi."purchasePrice"::double precision,
              'lineTotal', oi."lineTotal"::double precision
            ))
            FROM order_items oi
            WHERE oi."orderId" = o.id
          ),
          '[]'::json
        ) AS items
      FROM orders o
      INNER JOIN customers c ON c.id = o."customerId"
      LEFT JOIN referral_partners rp ON rp.id = o."referralPartnerId"
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY o."createdAt" DESC
      OFFSET ${skip}
      LIMIT ${input.pageSize}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM orders o
      WHERE ${Prisma.join(where, ' AND ')}
    `),
  ])

  return {
    items: orders.map((order) => ({ ...order, items: parseJson(order.items, []) })),
    total: totalRows[0]?.count ?? 0,
  }
}

export async function getOrderDetail(orderId: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<Omit<OrderDetailRow, 'items' | 'deliveries'> & { items: unknown; deliveries: unknown }>>(Prisma.sql`
    SELECT
      o.id,
      o."orderNumber" AS "orderNumber",
      o."invoiceNumber" AS "invoiceNumber",
      o."customerId" AS "customerId",
      o."referralPartnerId" AS "referralPartnerId",
      o."referralRewardAmount"::double precision AS "referralRewardAmount",
      o."referralRewardRate"::double precision AS "referralRewardRate",
      o."createdById" AS "createdById",
      o."orderDate" AS "orderDate",
      o."deliveryDate" AS "deliveryDate",
      o.status::text AS status,
      o."paymentMode"::text AS "paymentMode",
      o."amountPaid"::double precision AS "amountPaid",
      COALESCE(o."paidAmount", o."amountPaid")::double precision AS "paidAmount",
      COALESCE(o."dueAmount", (COALESCE(o."grandTotal", o."totalAmount") - COALESCE(o."paidAmount", o."amountPaid")))::double precision AS "dueAmount",
      COALESCE(o."grandTotal", o."totalAmount")::double precision AS "grandTotal",
      o."totalAmount"::double precision AS "totalAmount",
      o."marginPct"::double precision AS "marginPct",
      o.notes,
      o."isDeleted" AS "isDeleted",
      o."createdAt" AS "createdAt",
      o."updatedAt" AS "updatedAt",
      o."businessId" AS "businessId",
      json_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'altPhone', c."altPhone",
        'address', c.address,
        'siteAddress', c."siteAddress",
        'gstin', c.gstin,
        'creditLimit', c."creditLimit"::double precision,
        'riskTag', c."riskTag"::text,
        'notes', c.notes,
        'isActive', c."isActive",
        'remindersEnabled', c."remindersEnabled",
        'createdAt', c."createdAt",
        'updatedAt', c."updatedAt",
        'businessId', c."businessId"
      ) AS customer,
      CASE
        WHEN rp.id IS NULL THEN NULL
        ELSE json_build_object('id', rp.id, 'name', rp.name, 'role', rp.role)
      END AS "referralPartner",
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'id', oi.id,
            'orderId', oi."orderId",
            'materialId', oi."materialId",
            'variantId', oi."variantId",
            'quantity', oi.quantity::double precision,
            'unitPrice', oi."unitPrice"::double precision,
            'purchasePrice', oi."purchasePrice"::double precision,
            'lineTotal', oi."lineTotal"::double precision,
            'hsnCode', oi."hsnCode",
            'gstRate', oi."gstRate"::double precision,
            'taxableAmount', oi."taxableAmount"::double precision,
            'gstAmount', oi."gstAmount"::double precision,
            'cgstAmount', oi."cgstAmount"::double precision,
            'sgstAmount', oi."sgstAmount"::double precision,
            'igstAmount', oi."igstAmount"::double precision,
            'discountAmount', oi."discountAmount"::double precision,
            'material', json_build_object(
              'id', m.id,
              'name', m.name,
              'unit', m.unit,
              'stockQty', m."stockQty"::double precision,
              'minThreshold', m."minThreshold"::double precision,
              'maxThreshold', m."maxThreshold"::double precision,
              'purchasePrice', m."purchasePrice"::double precision,
              'salePrice', m."salePrice"::double precision,
              'isActive', m."isActive",
              'createdAt', m."createdAt",
              'updatedAt', m."updatedAt",
              'businessId', m."businessId"
            ),
            'variant', CASE
              WHEN pv.id IS NULL THEN NULL
              ELSE json_build_object(
                'id', pv.id,
                'name', pv.name,
                'unit', pv.unit,
                'attributes', pv.attributes
              )
            END
          ))
          FROM order_items oi
          INNER JOIN materials m ON m.id = oi."materialId"
          LEFT JOIN product_variants pv ON pv.id = oi."variantId"
          WHERE oi."orderId" = o.id
        ),
        '[]'::json
      ) AS items,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'id', d.id,
            'orderId', d."orderId",
            'challanNumber', d."challanNumber",
            'driverName', d."driverName",
            'vehicleNumber', d."vehicleNumber",
            'status', d.status::text,
            'confirmationType', d."confirmationType"::text,
            'confirmationRef', d."confirmationRef",
            'deliveredAt', d."deliveredAt",
            'createdAt', d."createdAt",
            'updatedAt', d."updatedAt"
          ) ORDER BY d."createdAt" DESC)
          FROM deliveries d
          WHERE d."orderId" = o.id
        ),
        '[]'::json
      ) AS deliveries
    FROM orders o
    INNER JOIN customers c ON c.id = o."customerId"
    LEFT JOIN referral_partners rp ON rp.id = o."referralPartnerId"
    WHERE o.id = ${orderId}
      AND o."businessId" = ${businessId}
      AND o."isDeleted" = false
    LIMIT 1
  `)

  const row = rows[0]
  if (!row) return null

  return {
    ...row,
    items: parseJson(row.items, []),
    deliveries: parseJson(row.deliveries, []),
  } as OrderDetailRow
}

export async function getOrderForChallan(orderId: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<Omit<OrderChallanRow, 'items' | 'deliveries'> & { items: unknown; deliveries: unknown }>>(Prisma.sql`
    SELECT
      o.id,
      o."orderNumber" AS "orderNumber",
      o."invoiceNumber" AS "invoiceNumber",
      o."createdAt" AS "createdAt",
      o."paymentMode"::text AS "paymentMode",
      o."amountPaid"::double precision AS "amountPaid",
      o."totalAmount"::double precision AS "totalAmount",
      json_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'address', c.address
      ) AS customer,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'id', oi.id,
            'orderId', oi."orderId",
            'materialId', oi."materialId",
            'variantId', oi."variantId",
            'quantity', oi.quantity::double precision,
            'unitPrice', oi."unitPrice"::double precision,
            'purchasePrice', oi."purchasePrice"::double precision,
            'lineTotal', oi."lineTotal"::double precision,
            'material', json_build_object(
              'id', m.id,
              'name', m.name,
              'unit', m.unit
            ),
            'variant', CASE
              WHEN pv.id IS NULL THEN NULL
              ELSE json_build_object(
                'id', pv.id,
                'name', pv.name,
                'unit', pv.unit,
                'attributes', pv.attributes
              )
            END
          ))
          FROM order_items oi
          INNER JOIN materials m ON m.id = oi."materialId"
          LEFT JOIN product_variants pv ON pv.id = oi."variantId"
          WHERE oi."orderId" = o.id
        ),
        '[]'::json
      ) AS items,
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'id', d.id,
            'orderId', d."orderId",
            'challanNumber', d."challanNumber",
            'driverName', d."driverName",
            'vehicleNumber', d."vehicleNumber",
            'createdAt', d."createdAt",
            'items', COALESCE(
              (
                SELECT json_agg(json_build_object(
                  'id', di.id,
                  'materialId', di."materialId",
                  'orderedQty', di."orderedQty"::double precision,
                  'deliveredQty', di."deliveredQty"::double precision,
                  'material', json_build_object(
                    'id', dm.id,
                    'name', dm.name,
                    'unit', dm.unit
                  )
                ))
                FROM delivery_items di
                INNER JOIN materials dm ON dm.id = di."materialId"
                WHERE di."deliveryId" = d.id
              ),
              '[]'::json
            )
          ) ORDER BY d."createdAt" DESC)
          FROM deliveries d
          WHERE d."orderId" = o.id
        ),
        '[]'::json
      ) AS deliveries
    FROM orders o
    INNER JOIN customers c ON c.id = o."customerId"
    WHERE o.id = ${orderId}
      AND o."businessId" = ${businessId}
      AND o."isDeleted" = false
    LIMIT 1
  `)

  const row = rows[0]
  if (!row) return null
  return {
    ...row,
    items: parseJson(row.items, []),
    deliveries: parseJson(row.deliveries, []),
  } as OrderChallanRow
}

// Allocates the next invoice number for a business/year atomically. The
// counter row is upserted with a relative increment inside the caller's
// transaction, so concurrent order creates serialize on the row lock and can
// never hand out the same number; a rollback releases the number's increment
// with the rest of the transaction (gapless legal numbering).
async function allocateInvoiceNumber(tx: Prisma.TransactionClient, businessId: string, year: number) {
  const rows = await tx.$queryRaw<Array<{ value: number }>>(Prisma.sql`
    INSERT INTO invoice_sequences ("businessId", year, value, "updatedAt")
    VALUES (${businessId}, ${year}, 1, NOW())
    ON CONFLICT ("businessId", year)
    DO UPDATE SET value = invoice_sequences.value + 1, "updatedAt" = NOW()
    RETURNING value
  `)
  const seq = rows[0]?.value
  if (!seq) throw new Error('Failed to allocate invoice number')
  return `INV-${year}-${String(seq).padStart(6, '0')}`
}

export async function createOrder(input: {
  customerId: string
  referralPartnerId?: string
  referralRewardAmount?: number
  referralRewardRate?: number
  createdById: string
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
  paidAmount?: number
  dueAmount?: number
  subtotal?: number
  itemDiscountTotal?: number
  invoiceDiscount?: number
  taxableAmount?: number
  gstTotal?: number
  cgstTotal?: number
  sgstTotal?: number
  igstTotal?: number
  transportCharges?: number
  loadingCharges?: number
  roundOff?: number
  grandTotal?: number
  billingSnapshot?: Prisma.JsonValue
  totalAmount: number
  marginPct: number
  notes?: string
  businessId: string
  sourceLocationId?: string | null
  deliveryDate?: string
  allowNegativeStock?: boolean
  items: Array<{
    materialId: string
    variantId?: string
    quantity: number
    unitPrice: number
    purchasePrice: number
    deductionQty?: number
    lineTotal?: number
    hsnCode?: string
    gstRate?: number
    taxableAmount?: number
    gstAmount?: number
    cgstAmount?: number
    sgstAmount?: number
    igstAmount?: number
    discountAmount?: number
  }>
}) {
  const newOrderId = randomUUID()
  const sourceLocationId = await resolveSourceLocationId(input.businessId, input.sourceLocationId)
  let rows: Array<{ id: string }>
  try {
    rows = await prisma.$transaction(async (tx) => {
    const customerRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM customers
      WHERE id = ${input.customerId} AND "businessId" = ${input.businessId} AND "isActive" = true
      LIMIT 1
    `)
    if (customerRows.length === 0) throw new Error('Customer does not belong to this business')

    const actorRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM users
      WHERE id = ${input.createdById} AND "businessId" = ${input.businessId} AND "isActive" = true
      LIMIT 1
    `)
    if (actorRows.length === 0) throw new Error('Actor does not belong to this business')

    const orderNumber = await allocateInvoiceNumber(tx, input.businessId, new Date().getFullYear())
    const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO orders (
        id,
        "orderNumber",
        "invoiceNumber",
        "customerId",
        "referralPartnerId",
        "referralRewardAmount",
        "referralRewardRate",
        "createdById",
        "paymentMode",
        "amountPaid",
        "paidAmount",
        "dueAmount",
        "subtotal",
        "itemDiscountTotal",
        "invoiceDiscount",
        "taxableAmount",
        "gstTotal",
        "cgstTotal",
        "sgstTotal",
        "igstTotal",
        "transportCharges",
        "loadingCharges",
        "roundOff",
        "grandTotal",
        "billingSnapshot",
        "totalAmount",
        "marginPct",
        notes,
        "businessId",
        "sourceLocationId",
        "deliveryDate",
        "orderDate",
        status,
        "isDeleted",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${newOrderId},
        ${orderNumber},
        ${orderNumber},
        ${input.customerId},
        ${input.referralPartnerId ?? null},
        ${input.referralRewardAmount ?? null},
        ${input.referralRewardRate ?? null},
        ${input.createdById},
        ${input.paymentMode}::"PaymentMode",
        ${input.amountPaid},
        ${input.paidAmount ?? input.amountPaid},
        ${input.dueAmount ?? Math.max(0, (input.grandTotal ?? input.totalAmount) - (input.paidAmount ?? input.amountPaid))},
        ${input.subtotal ?? input.totalAmount},
        ${input.itemDiscountTotal ?? 0},
        ${input.invoiceDiscount ?? 0},
        ${input.taxableAmount ?? input.totalAmount},
        ${input.gstTotal ?? 0},
        ${input.cgstTotal ?? 0},
        ${input.sgstTotal ?? 0},
        ${input.igstTotal ?? 0},
        ${input.transportCharges ?? 0},
        ${input.loadingCharges ?? 0},
        ${input.roundOff ?? 0},
        ${input.grandTotal ?? input.totalAmount},
        ${input.billingSnapshot ?? null},
        ${input.totalAmount},
        ${input.marginPct},
        ${input.notes ?? null},
        ${input.businessId},
        ${sourceLocationId},
        ${input.deliveryDate ? new Date(input.deliveryDate) : null},
        NOW(),
        'CONFIRMED'::"OrderStatus",
        false,
        NOW(),
        NOW()
      ) RETURNING id
    `)

    const createdOrderId = created[0]?.id
    if (!createdOrderId) throw new Error('Failed to create order')

    const materialIds = [...new Set(input.items.map((item) => item.materialId))]
    const materialRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM materials
      WHERE "businessId" = ${input.businessId}
        AND "isActive" = true
        AND id IN (${Prisma.join(materialIds)})
    `)
    const validMaterialIds = new Set(materialRows.map((row) => row.id))
    if (validMaterialIds.size !== materialIds.length) {
      throw new Error('One or more selected materials were not found')
    }

    const variantIds = [...new Set(input.items.map((item) => item.variantId).filter(Boolean) as string[])]
    const variantMaterialMap = new Map<string, string>()
    if (variantIds.length > 0) {
      const variantRows = await tx.$queryRaw<Array<{ id: string; materialId: string }>>(Prisma.sql`
        SELECT id, "materialId" AS "materialId"
        FROM product_variants
        WHERE "businessId" = ${input.businessId}
          AND "isActive" = true
          AND id IN (${Prisma.join(variantIds)})
      `)
      if (variantRows.length !== variantIds.length) {
        throw new Error('One or more selected variants were not found')
      }
      for (const row of variantRows) variantMaterialMap.set(row.id, row.materialId)
    }

    const orderItemValues = input.items.map((item) => {
      if (item.variantId) {
        const variantMaterialId = variantMaterialMap.get(item.variantId)
        if (!variantMaterialId || variantMaterialId !== item.materialId) {
          throw new Error('Selected variant does not belong to selected material')
        }
      }
      const lineTotal = item.lineTotal ?? (item.quantity * item.unitPrice)
      return Prisma.sql`(
        ${randomUUID()},
        ${createdOrderId},
        ${item.materialId},
        ${item.variantId ?? null},
        ${item.quantity},
        ${item.hsnCode ?? null},
        ${item.gstRate ?? null},
        ${item.taxableAmount ?? null},
        ${item.gstAmount ?? null},
        ${item.cgstAmount ?? null},
        ${item.sgstAmount ?? null},
        ${item.igstAmount ?? null},
        ${item.discountAmount ?? null},
        ${item.unitPrice},
        ${item.purchasePrice},
        ${lineTotal}
      )`
    })
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO order_items (
        id,
        "orderId",
        "materialId",
        "variantId",
        quantity,
        "hsnCode",
        "gstRate",
        "taxableAmount",
        "gstAmount",
        "cgstAmount",
        "sgstAmount",
        "igstAmount",
        "discountAmount",
        "unitPrice",
        "purchasePrice",
        "lineTotal"
      ) VALUES ${Prisma.join(orderItemValues)}
    `)

    // ── Stock deduction (atomic, set-based) ─────────────────────────────────
    // Deduct every material's total in one guarded relative UPDATE: the delta is
    // applied against the row's current value under a row lock, so concurrent
    // orders serialize instead of losing updates, and the negative-stock guard
    // cannot be bypassed by a race. Per-line stockAfter snapshots are then
    // reconstructed from the returned final quantities (deductions are all
    // positive, so if the final quantity passes the guard every intermediate
    // per-line value did too).
    const deductionByMaterial = new Map<string, number>()
    for (const item of input.items) {
      const quantity = Number(item.deductionQty ?? item.quantity)
      deductionByMaterial.set(item.materialId, (deductionByMaterial.get(item.materialId) ?? 0) + quantity)
    }
    const allowNegative = input.allowNegativeStock === true
    const deductionValues = [...deductionByMaterial.entries()].map(([id, qty]) => Prisma.sql`(${id}::text, ${qty}::numeric)`)
    const deductedRows = await tx.$queryRaw<Array<{ materialId: string; quantity: number }>>(Prisma.sql`
      UPDATE material_stock ms
      SET quantity = ms.quantity - v.qty, "updatedAt" = NOW()
      FROM (VALUES ${Prisma.join(deductionValues)}) AS v("materialId", qty)
      WHERE ms."businessId" = ${input.businessId}
        AND ms."locationId" = ${sourceLocationId}
        AND ms."materialId" = v."materialId"
        AND (${allowNegative} OR ms.quantity >= v.qty)
      RETURNING ms."materialId" AS "materialId", ms.quantity::double precision AS quantity
    `)
    const finalQty = new Map(deductedRows.map((row) => [row.materialId, Number(row.quantity)]))

    // Materials with no returned row either have no stock row at this location
    // or failed the guard — both mean insufficient stock unless negatives are
    // allowed, in which case we create the row carrying the negative balance.
    const missingMaterials = [...deductionByMaterial.keys()].filter((id) => !finalQty.has(id))
    if (missingMaterials.length > 0) {
      if (!allowNegative) throw new Error('Insufficient stock in selected location')
      for (const materialId of missingMaterials) {
        const quantity = deductionByMaterial.get(materialId) ?? 0
        const inserted = await tx.$queryRaw<Array<{ quantity: number }>>(Prisma.sql`
          INSERT INTO material_stock AS ms (id, "businessId", "materialId", "locationId", quantity, "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${input.businessId}, ${materialId}, ${sourceLocationId}, ${-quantity}, NOW(), NOW())
          ON CONFLICT ("businessId", "materialId", "locationId")
          DO UPDATE SET quantity = ms.quantity + EXCLUDED.quantity, "updatedAt" = NOW()
          RETURNING quantity::double precision AS quantity
        `)
        finalQty.set(materialId, Number(inserted[0]?.quantity ?? -quantity))
      }
    }

    // Rebuild sequential per-line stockAfter values from the final quantities.
    const runningQty = new Map<string, number>()
    for (const [materialId, totalQty] of deductionByMaterial) {
      runningQty.set(materialId, (finalQty.get(materialId) ?? -totalQty) + totalQty)
    }
    const movementRows: Array<{ materialId: string; quantity: number; stockAfter: number }> = []
    for (const item of input.items) {
      const quantity = Number(item.deductionQty ?? item.quantity)
      const stockAfter = (runningQty.get(item.materialId) ?? 0) - quantity
      runningQty.set(item.materialId, stockAfter)
      movementRows.push({ materialId: item.materialId, quantity, stockAfter })
    }

    // Recompute each affected material's total stock across locations in one statement.
    await tx.$executeRaw(Prisma.sql`
      UPDATE materials m
      SET
        "stockQty" = COALESCE((
          SELECT SUM(ms.quantity)
          FROM material_stock ms
          WHERE ms."businessId" = ${input.businessId}
            AND ms."materialId" = m.id
        ), 0),
        "updatedAt" = NOW()
      WHERE m."businessId" = ${input.businessId}
        AND m.id IN (${Prisma.join(materialIds)})
    `)

    const movementValues = movementRows.map((row) => Prisma.sql`(
      ${randomUUID()},
      ${row.materialId},
      ${createdOrderId},
      'OUT'::"StockMovementType",
      ${row.quantity},
      ${row.stockAfter},
      ${`Order ${orderNumber}`},
      ${input.createdById},
      NOW(),
      ${input.businessId}
    )`)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO stock_movements (
        id,
        "materialId",
        "orderId",
        type,
        quantity,
        "stockAfter",
        reason,
        "recordedById",
        "createdAt",
        "businessId"
      ) VALUES ${Prisma.join(movementValues)}
    `)

    const debitLedgerEntryId = randomUUID()
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id,
        "customerId",
        "orderId",
        type,
        amount,
        "paymentMode",
        "recordedById",
        notes,
        "createdAt",
        "businessId"
      ) VALUES (
        ${debitLedgerEntryId},
        ${input.customerId},
        ${createdOrderId},
        'DEBIT'::"LedgerEntryType",
        ${input.totalAmount},
        ${input.paymentMode}::"PaymentMode",
        ${input.createdById},
        ${`Order ${orderNumber}`},
        NOW(),
        ${input.businessId}
      )
    `)

    // Mirror the sale into the double-entry ledger (Dr Customer, Cr Sales/GST).
    const custNameRows = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT name FROM customers WHERE id = ${input.customerId} AND "businessId" = ${input.businessId} LIMIT 1
    `)
    const customerName = custNameRows[0]?.name ?? 'Customer'
    await postSaleVoucher(tx, {
      businessId: input.businessId,
      createdById: input.createdById,
      customerId: input.customerId,
      customerName,
      orderId: createdOrderId,
      orderNumber: orderNumber,
      date: new Date(),
      taxableAmount: input.taxableAmount ?? input.totalAmount,
      cgstTotal: input.cgstTotal ?? 0,
      sgstTotal: input.sgstTotal ?? 0,
      igstTotal: input.igstTotal ?? 0,
      otherCharges: (input.transportCharges ?? 0) + (input.loadingCharges ?? 0),
      invoiceDiscount: input.invoiceDiscount ?? 0,
      grandTotal: input.grandTotal ?? input.totalAmount,
      paymentMode: input.paymentMode,
    })

    if (input.amountPaid > 0) {
      const creditLedgerEntryId = randomUUID()
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO ledger_entries (
          id,
          "customerId",
          "orderId",
          type,
          amount,
          "paymentMode",
          "recordedById",
          notes,
          "createdAt",
          "businessId"
        ) VALUES (
          ${creditLedgerEntryId},
          ${input.customerId},
          ${createdOrderId},
          'CREDIT'::"LedgerEntryType",
          ${input.amountPaid},
          ${input.paymentMode}::"PaymentMode",
          ${input.createdById},
          ${`Payment with order ${orderNumber}`},
          NOW(),
          ${input.businessId}
        )
      `)
      // Mirror the with-order payment as a receipt (Dr Cash/Bank, Cr Customer).
      await postCustomerReceiptVoucher(tx, {
        businessId: input.businessId,
        createdById: input.createdById,
        customerId: input.customerId,
        customerName,
        amount: input.amountPaid,
        paymentMode: input.paymentMode,
        date: new Date(),
        orderId: createdOrderId,
        ledgerEntryId: creditLedgerEntryId,
        narration: `Payment with order ${orderNumber}`,
      })
    }

    return created
    }, { maxWait: ORDER_TX_MAX_WAIT_MS, timeout: ORDER_TX_TIMEOUT_MS })
  } catch (error: any) {
    // The transaction connection can drop after a successful commit ("Transaction
    // not found"). The order id is generated before the transaction, so we can
    // check whether the order actually landed and recover instead of failing.
    if (String(error?.message ?? '').includes('Transaction API error: Transaction not found')) {
      const recovered = await prisma.$queryRaw<Array<{ id: string; orderNumber: string }>>(Prisma.sql`
        SELECT id, "orderNumber" AS "orderNumber"
        FROM orders
        WHERE id = ${newOrderId} AND "businessId" = ${input.businessId} AND "isDeleted" = false
        LIMIT 1
      `)
      if (recovered[0]) return { ...recovered[0], recovered: true }
    }
    throw error
  }

  const createdId = rows[0]?.id
  if (!createdId) return null

  const row = await prisma.$queryRaw<Array<{ id: string; orderNumber: string }>>(Prisma.sql`
    SELECT id, "orderNumber" AS "orderNumber"
    FROM orders
    WHERE id = ${createdId} AND "businessId" = ${input.businessId}
    LIMIT 1
  `)
  return row[0] ?? null
}

export async function getOrderByNumber(orderNumber: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; orderNumber: string }>>(Prisma.sql`
    SELECT id, "orderNumber" AS "orderNumber"
    FROM orders
    WHERE "orderNumber" = ${orderNumber}
      AND "businessId" = ${businessId}
      AND "isDeleted" = false
    LIMIT 1
  `)
  return rows[0] ?? null
}

// The GST context an order was billed under, so appended lines are taxed the
// same way as the original invoice. Falls back to the stored totals when the
// billing snapshot is missing (legacy orders).
export async function getOrderBillingFlags(orderId: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<{ billingSnapshot: unknown; gstTotal: number | null; igstTotal: number | null }>>(Prisma.sql`
    SELECT
      "billingSnapshot" AS "billingSnapshot",
      "gstTotal"::double precision AS "gstTotal",
      "igstTotal"::double precision AS "igstTotal"
    FROM orders
    WHERE id = ${orderId} AND "businessId" = ${businessId} AND "isDeleted" = false
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const snapshot = parseJson<Record<string, unknown>>(row.billingSnapshot as any, {}) ?? {}
  return {
    gstEnabled: snapshot.gstEnabled === true || Number(row.gstTotal ?? 0) > 0,
    isInterState: snapshot.isInterState === true || Number(row.igstTotal ?? 0) > 0,
  }
}

export async function appendItemToOrder(input: {
  orderId: string
  businessId: string
  materialId: string
  variantId?: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  lineTotal?: number
  itemSubtotal?: number
  hsnCode?: string
  gstRate?: number
  taxableAmount?: number
  gstAmount?: number
  cgstAmount?: number
  sgstAmount?: number
  igstAmount?: number
  discountAmount?: number
  deductionQty?: number
  allowNegativeStock?: boolean
  userId: string
  orderNumber: string
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  customerId: string
}) {
  await prisma.$transaction(async (tx) => {
    const ownedOrderRows = await tx.$queryRaw<Array<{ id: string; sourceLocationId: string | null }>>(Prisma.sql`
      SELECT id, "sourceLocationId" AS "sourceLocationId"
      FROM orders
      WHERE id = ${input.orderId} AND "businessId" = ${input.businessId} AND "isDeleted" = false
      LIMIT 1
    `)
    if (ownedOrderRows.length === 0) throw new Error('Order not found for this business')
    const order = ownedOrderRows[0]
    const sourceLocationId = await resolveSourceLocationId(input.businessId, order.sourceLocationId)

    const mats = await tx.$queryRaw<Array<{ stockQty: number }>>(Prisma.sql`
      SELECT "stockQty"::double precision AS "stockQty"
      FROM materials
      WHERE id = ${input.materialId} AND "businessId" = ${input.businessId} AND "isActive" = true
      LIMIT 1
    `)
    const material = mats[0]
    if (!material) throw new Error('Material not found for this business')

    if (input.variantId) {
      const variantRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM product_variants
        WHERE id = ${input.variantId}
          AND "businessId" = ${input.businessId}
          AND "materialId" = ${input.materialId}
          AND "isActive" = true
        LIMIT 1
      `)
      if (variantRows.length === 0) throw new Error('Variant not found for selected material')
    }

    const lineTotal = input.lineTotal ?? (input.quantity * input.unitPrice)
    const orderItemId = randomUUID()
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO order_items (
        id,
        "orderId",
        "materialId",
        "variantId",
        quantity,
        "hsnCode",
        "gstRate",
        "taxableAmount",
        "gstAmount",
        "cgstAmount",
        "sgstAmount",
        "igstAmount",
        "discountAmount",
        "unitPrice",
        "purchasePrice",
        "lineTotal"
      ) VALUES (
        ${orderItemId},
        ${input.orderId},
        ${input.materialId},
        ${input.variantId ?? null},
        ${input.quantity},
        ${input.hsnCode ?? null},
        ${input.gstRate ?? null},
        ${input.taxableAmount ?? null},
        ${input.gstAmount ?? null},
        ${input.cgstAmount ?? null},
        ${input.sgstAmount ?? null},
        ${input.igstAmount ?? null},
        ${input.discountAmount ?? null},
        ${input.unitPrice},
        ${input.purchasePrice},
        ${lineTotal}
      )
    `)

    // Update order totals incrementally with the billing-engine-computed line
    // amounts (the route runs calculateInvoice on the new line). Totals stay
    // linear sums of engine output — the previous SQL re-aggregation was a
    // second, divergent billing path. All SET expressions read the OLD row
    // values, so the grandTotal fallbacks below never double-count.
    const lineTaxable = input.taxableAmount ?? lineTotal
    const lineGst = input.gstAmount ?? 0
    const lineDiscount = input.discountAmount ?? 0
    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET
        "totalAmount" = COALESCE("totalAmount", 0) + ${lineTotal},
        "grandTotal" = COALESCE("grandTotal", "totalAmount", 0) + ${lineTotal},
        "subtotal" = COALESCE("subtotal", 0) + ${input.itemSubtotal ?? (lineTaxable + lineDiscount)},
        "taxableAmount" = COALESCE("taxableAmount", 0) + ${lineTaxable},
        "itemDiscountTotal" = COALESCE("itemDiscountTotal", 0) + ${lineDiscount},
        "gstTotal" = COALESCE("gstTotal", 0) + ${lineGst},
        "cgstTotal" = COALESCE("cgstTotal", 0) + ${input.cgstAmount ?? 0},
        "sgstTotal" = COALESCE("sgstTotal", 0) + ${input.sgstAmount ?? 0},
        "igstTotal" = COALESCE("igstTotal", 0) + ${input.igstAmount ?? 0},
        "dueAmount" = GREATEST(0, COALESCE("grandTotal", "totalAmount", 0) + ${lineTotal} - COALESCE("paidAmount", "amountPaid")),
        "marginPct" = (
          SELECT COALESCE(AVG((CASE WHEN "purchasePrice" = 0 THEN 0 ELSE ("unitPrice" - "purchasePrice") / "purchasePrice" * 100 END)), 0)
          FROM order_items
          WHERE "orderId" = ${input.orderId}
        ),
        "updatedAt" = NOW()
      WHERE id = ${input.orderId} AND "businessId" = ${input.businessId}
    `)

    const debitLedgerEntryId = randomUUID()
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id,
        "customerId",
        "orderId",
        type,
        amount,
        "paymentMode",
        "recordedById",
        notes,
        "createdAt",
        "businessId"
      ) VALUES (
        ${debitLedgerEntryId},
        ${input.customerId},
        ${input.orderId},
        'DEBIT'::"LedgerEntryType",
        ${lineTotal},
        ${input.paymentMode}::"PaymentMode",
        ${input.userId},
        ${`Added item to Order ${input.orderNumber}`},
        NOW(),
        ${input.businessId}
      )
    `)

    // Keep the double-entry journal in step with the khata: post an incremental
    // SALE voucher for the appended line (Dr Customer, Cr Sales/Output GST).
    const custRows = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT name FROM customers WHERE id = ${input.customerId} AND "businessId" = ${input.businessId} LIMIT 1
    `)
    await postSaleVoucher(tx, {
      businessId: input.businessId,
      createdById: input.userId,
      customerId: input.customerId,
      customerName: custRows[0]?.name ?? 'Customer',
      orderId: input.orderId,
      orderNumber: `${input.orderNumber} (item added)`,
      date: new Date(),
      taxableAmount: lineTaxable,
      cgstTotal: input.cgstAmount ?? 0,
      sgstTotal: input.sgstAmount ?? 0,
      igstTotal: input.igstAmount ?? 0,
      otherCharges: 0,
      invoiceDiscount: 0,
      grandTotal: lineTotal,
      paymentMode: input.paymentMode,
    })

    const stockAfter = await adjustMaterialLocationStock(tx, {
      businessId: input.businessId,
      materialId: input.materialId,
      locationId: sourceLocationId,
      deltaQty: -Number(input.deductionQty ?? input.quantity),
      allowNegativeStock: input.allowNegativeStock,
    })

    const stockMovementId = randomUUID()
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO stock_movements (
        id,
        "materialId",
        "orderId",
        type,
        quantity,
        "stockAfter",
        reason,
        "recordedById",
        "createdAt",
        "businessId"
      ) VALUES (
        ${stockMovementId},
        ${input.materialId},
        ${input.orderId},
        'OUT'::"StockMovementType",
        ${Number(input.deductionQty ?? input.quantity)},
        ${stockAfter},
        ${`Added to Order ${input.orderNumber}`},
        ${input.userId},
        NOW(),
        ${input.businessId}
      )
    `)
  }, { maxWait: 10000, timeout: 15000 })
}

export async function setOrderStatus(orderId: string, businessId: string, status: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
    UPDATE orders
    SET status = ${status}::"OrderStatus", "updatedAt" = NOW()
    WHERE id = ${orderId} AND "businessId" = ${businessId} AND "isDeleted" = false
    RETURNING id, status::text AS status
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function createDispatchDelivery(orderId: string, businessId: string, challanNumber: string) {
  await prisma.$transaction(async (tx) => {
    const ownedOrder = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM orders
      WHERE id = ${orderId} AND "businessId" = ${businessId} AND "isDeleted" = false
      LIMIT 1
    `)
    if (ownedOrder.length === 0) throw new Error('Order not found for this business')

    const items = await tx.$queryRaw<Array<{ materialId: string; quantity: number }>>(Prisma.sql`
      SELECT "materialId" AS "materialId", quantity::double precision AS quantity
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi."orderId"
      WHERE oi."orderId" = ${orderId}
        AND o."businessId" = ${businessId}
        AND o."isDeleted" = false
    `)

    const deliveryId = randomUUID()
    const delivery = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO deliveries (
        id,
        "orderId",
        "challanNumber",
        status,
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${deliveryId},
        ${orderId},
        ${challanNumber},
        'IN_TRANSIT'::"DeliveryStatus",
        NOW(),
        NOW()
      ) RETURNING id
    `)

    const createdDeliveryId = delivery[0]?.id
    if (!createdDeliveryId) throw new Error('Failed to create delivery')

    for (const item of items) {
      const deliveryItemId = randomUUID()
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO delivery_items (
          id,
          "deliveryId",
          "materialId",
          "orderedQty",
          "deliveredQty"
        ) VALUES (
          ${deliveryItemId},
          ${createdDeliveryId},
          ${item.materialId},
          ${item.quantity},
          ${item.quantity}
        )
      `)
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET status = 'DISPATCHED'::"OrderStatus", "updatedAt" = NOW()
      WHERE id = ${orderId} AND "businessId" = ${businessId}
    `)
  }, { maxWait: 10000, timeout: 15000 })
}

export async function markDeliveredAndCloseDeliveries(orderId: string, businessId: string, deliveryIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET status = 'DELIVERED'::"OrderStatus", "updatedAt" = NOW()
      WHERE id = ${orderId} AND "businessId" = ${businessId}
    `)

    if (deliveryIds.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE deliveries d
        SET status = 'DELIVERED'::"DeliveryStatus", "deliveredAt" = NOW(), "updatedAt" = NOW()
        FROM orders o
        WHERE d.id IN (${Prisma.join(deliveryIds)})
          AND o.id = d."orderId"
          AND o."businessId" = ${businessId}
          AND d.status <> 'DELIVERED'::"DeliveryStatus"
          AND d.status <> 'FAILED'::"DeliveryStatus"
      `)
    }
  }, { maxWait: 10000, timeout: 15000 })
}

export async function softDeleteOrder(orderId: string, businessId: string) {
  await prisma.$transaction(async (tx) => {
    const orderRows = await tx.$queryRaw<Array<{
      id: string
      sourceLocationId: string | null
      status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
      customerId: string
      createdById: string
      paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
      totalAmount: number
      amountPaid: number
      orderNumber: string
    }>>(Prisma.sql`
      SELECT
        id,
        "sourceLocationId" AS "sourceLocationId",
        status::text AS status,
        "customerId" AS "customerId",
        "createdById" AS "createdById",
        "paymentMode"::text AS "paymentMode",
        "totalAmount"::double precision AS "totalAmount",
        "amountPaid"::double precision AS "amountPaid",
        "orderNumber" AS "orderNumber"
      FROM orders
      WHERE id = ${orderId} AND "businessId" = ${businessId} AND "isDeleted" = false
      LIMIT 1
    `)
    const order = orderRows[0]
    if (!order) throw new Error('ORDER_NOT_FOUND')
    const sourceLocationId = await resolveSourceLocationId(businessId, order.sourceLocationId)

    const items = await tx.$queryRaw<Array<{ materialId: string; quantity: number }>>(Prisma.sql`
      SELECT "materialId" AS "materialId", quantity::double precision AS quantity
      FROM order_items
      WHERE "orderId" = ${orderId}
    `)

    const shouldRestoreStock = order.status !== 'DELIVERED'
    if (shouldRestoreStock) {
      for (const item of items) {
        await adjustMaterialLocationStock(tx, {
          businessId,
          materialId: item.materialId,
          locationId: sourceLocationId,
          deltaQty: item.quantity,
          allowNegativeStock: true,
        })
      }
      await tx.$executeRaw(Prisma.sql`DELETE FROM stock_movements WHERE "orderId" = ${orderId} AND "businessId" = ${businessId}`)
    }

    const dueAmount = order.totalAmount - order.amountPaid
    const shouldKeepKhata = order.status === 'DELIVERED' && dueAmount > 0
    if (shouldKeepKhata) {
      const ref = `SOFT_DELETED_ORDER:${order.orderNumber}`
      const note = `Order soft-deleted after delivery; pending due retained in khata.`
      await tx.$executeRaw(Prisma.sql`
        UPDATE ledger_entries
        SET
          reference = COALESCE(reference, ${ref}),
          notes = COALESCE(notes, ${note})
        WHERE "orderId" = ${orderId}
      `)
    } else {
      await tx.$executeRaw(Prisma.sql`DELETE FROM ledger_entries WHERE "orderId" = ${orderId}`)
      // Khata entries are gone — remove the order's vouchers too, or the
      // journal would keep receivables the khata no longer shows.
      await deleteOrderJournalEntries(tx, orderId, businessId)
    }

    if (order.status !== 'DELIVERED') {
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM delivery_items
        WHERE "deliveryId" IN (SELECT id FROM deliveries WHERE "orderId" = ${orderId})
      `)
      await tx.$executeRaw(Prisma.sql`DELETE FROM deliveries WHERE "orderId" = ${orderId}`)
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET "isDeleted" = true, "updatedAt" = NOW()
      WHERE id = ${orderId} AND "businessId" = ${businessId}
    `)
  }, { maxWait: 10000, timeout: 15000 })
}

export async function cancelOrderWithReversal(orderId: string, businessId: string) {
  await prisma.$transaction(async (tx) => {
    const orderRows = await tx.$queryRaw<Array<{ status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'; sourceLocationId: string | null }>>(Prisma.sql`
      SELECT
        status::text AS status,
        "sourceLocationId" AS "sourceLocationId"
      FROM orders
      WHERE id = ${orderId} AND "businessId" = ${businessId} AND "isDeleted" = false
      LIMIT 1
    `)
    const current = orderRows[0]
    if (!current) throw new Error('ORDER_NOT_FOUND')
    const sourceLocationId = await resolveSourceLocationId(businessId, current.sourceLocationId)
    if (current.status === 'DELIVERED') throw new Error('DELIVERED_ORDER_CANNOT_BE_CANCELLED')
    if (current.status === 'CANCELLED') return

    const items = await tx.$queryRaw<Array<{ materialId: string; quantity: number }>>(Prisma.sql`
      SELECT oi."materialId" AS "materialId", oi.quantity::double precision AS quantity
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi."orderId"
      WHERE oi."orderId" = ${orderId}
        AND o."businessId" = ${businessId}
    `)

    for (const item of items) {
      await adjustMaterialLocationStock(tx, {
        businessId,
        materialId: item.materialId,
        locationId: sourceLocationId,
        deltaQty: item.quantity,
        allowNegativeStock: true,
      })
    }

    await tx.$executeRaw(Prisma.sql`DELETE FROM stock_movements WHERE "orderId" = ${orderId} AND "businessId" = ${businessId}`)
    await tx.$executeRaw(Prisma.sql`DELETE FROM ledger_entries WHERE "orderId" = ${orderId} AND "businessId" = ${businessId}`)
    // Mirror the khata cleanup in the double-entry ledger (SALE + RECEIPT vouchers).
    await deleteOrderJournalEntries(tx, orderId, businessId)

    await tx.$executeRaw(Prisma.sql`
      DELETE FROM delivery_items
      WHERE "deliveryId" IN (
        SELECT d.id
        FROM deliveries d
        INNER JOIN orders o ON o.id = d."orderId"
        WHERE d."orderId" = ${orderId} AND o."businessId" = ${businessId}
      )
    `)
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM deliveries d
      USING orders o
      WHERE d."orderId" = ${orderId}
        AND o.id = d."orderId"
        AND o."businessId" = ${businessId}
    `)

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET status = 'CANCELLED'::"OrderStatus", "updatedAt" = NOW()
      WHERE id = ${orderId} AND "businessId" = ${businessId}
    `)
  }, { maxWait: 10000, timeout: 15000 })
}

export async function bulkSoftDeleteOrders(ids: string[], businessId: string) {
  const orders = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM orders
    WHERE id IN (${Prisma.join(ids)}) AND "businessId" = ${businessId} AND "isDeleted" = false
  `)

  for (const order of orders) {
    await softDeleteOrder(order.id, businessId)
  }

  return orders.length
}
