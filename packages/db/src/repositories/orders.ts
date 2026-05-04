import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'
import { adjustMaterialLocationStock, resolveSourceLocationId } from './multi-location'

const ORDER_TX_MAX_WAIT_MS = 10_000
const ORDER_TX_TIMEOUT_MS = 120_000

export interface OrderListItemRow {
  id: string
  orderNumber: string
  invoiceNumber: string | null
  customerId: string
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
  items: Array<{
    id: string
    orderId: string
    materialId: string
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
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', oi.id,
              'orderId', oi."orderId",
              'materialId', oi."materialId",
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
      COALESCE(
        (
          SELECT json_agg(json_build_object(
            'id', oi.id,
            'orderId', oi."orderId",
            'materialId', oi."materialId",
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
            )
          ))
          FROM order_items oi
          INNER JOIN materials m ON m.id = oi."materialId"
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
            'quantity', oi.quantity::double precision,
            'unitPrice', oi."unitPrice"::double precision,
            'purchasePrice', oi."purchasePrice"::double precision,
            'lineTotal', oi."lineTotal"::double precision,
            'material', json_build_object(
              'id', m.id,
              'name', m.name,
              'unit', m.unit
            )
          ))
          FROM order_items oi
          INNER JOIN materials m ON m.id = oi."materialId"
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

export async function createOrder(input: {
  orderNumber: string
  invoiceNumber?: string
  customerId: string
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
  const rows = await prisma.$transaction(async (tx) => {
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
    const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO orders (
        id,
        "orderNumber",
        "invoiceNumber",
        "customerId",
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
        ${input.orderNumber},
        ${input.invoiceNumber ?? input.orderNumber},
        ${input.customerId},
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

    for (const item of input.items) {
      const lineTotal = item.lineTotal ?? (item.quantity * item.unitPrice)
      const orderItemId = randomUUID()
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO order_items (
          id,
          "orderId",
          "materialId",
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
          ${createdOrderId},
          ${item.materialId},
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
        )
      `)

      const mats = await tx.$queryRaw<Array<{ stockQty: number }>>(Prisma.sql`
        SELECT "stockQty"::double precision AS "stockQty"
        FROM materials
        WHERE id = ${item.materialId} AND "businessId" = ${input.businessId} AND "isActive" = true
        LIMIT 1
      `)
      const material = mats[0]
      if (!material) throw new Error(`Material ${item.materialId} not found`)

      const stockAfter = await adjustMaterialLocationStock(tx, {
        businessId: input.businessId,
        materialId: item.materialId,
        locationId: sourceLocationId,
        deltaQty: -Number(item.deductionQty ?? item.quantity),
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
          ${item.materialId},
          ${createdOrderId},
          'OUT'::"StockMovementType",
          ${Number(item.deductionQty ?? item.quantity)},
          ${stockAfter},
          ${`Order ${input.orderNumber}`},
          ${input.createdById},
          NOW(),
          ${input.businessId}
        )
      `)
    }

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
        ${`Order ${input.orderNumber}`},
        NOW(),
        ${input.businessId}
      )
    `)

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
          ${`Payment with order ${input.orderNumber}`},
          NOW(),
          ${input.businessId}
        )
      `)
    }

    return created
  }, { maxWait: ORDER_TX_MAX_WAIT_MS, timeout: ORDER_TX_TIMEOUT_MS })

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

export async function appendItemToOrder(input: {
  orderId: string
  businessId: string
  materialId: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  lineTotal?: number
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

    const lineTotal = input.lineTotal ?? (input.quantity * input.unitPrice)
    const orderItemId = randomUUID()
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO order_items (
        id,
        "orderId",
        "materialId",
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

    const totals = await tx.$queryRaw<Array<{ total: number; margin: number; taxable: number; gst: number; cgst: number; sgst: number; igst: number; discount: number }>>(Prisma.sql`
      SELECT
        COALESCE(SUM("lineTotal"), 0)::double precision AS total,
        COALESCE(AVG((CASE WHEN "purchasePrice" = 0 THEN 0 ELSE ("unitPrice" - "purchasePrice") / "purchasePrice" * 100 END)), 0)::double precision AS margin
        ,COALESCE(SUM(COALESCE("taxableAmount", quantity * "unitPrice")), 0)::double precision AS taxable
        ,COALESCE(SUM(COALESCE("gstAmount", 0)), 0)::double precision AS gst
        ,COALESCE(SUM(COALESCE("cgstAmount", 0)), 0)::double precision AS cgst
        ,COALESCE(SUM(COALESCE("sgstAmount", 0)), 0)::double precision AS sgst
        ,COALESCE(SUM(COALESCE("igstAmount", 0)), 0)::double precision AS igst
        ,COALESCE(SUM(COALESCE("discountAmount", 0)), 0)::double precision AS discount
      FROM order_items
      WHERE "orderId" = ${input.orderId}
    `)

    const agg = totals[0] ?? { total: 0, margin: 0, taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, discount: 0 }
    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET
        "totalAmount" = ${agg.total},
        "grandTotal" = ${agg.total},
        "subtotal" = ${agg.taxable + agg.discount},
        "taxableAmount" = ${agg.taxable},
        "itemDiscountTotal" = ${agg.discount},
        "gstTotal" = ${agg.gst},
        "cgstTotal" = ${agg.cgst},
        "sgstTotal" = ${agg.sgst},
        "igstTotal" = ${agg.igst},
        "dueAmount" = GREATEST(0, ${agg.total} - COALESCE("paidAmount", "amountPaid")),
        "marginPct" = ${agg.margin},
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

export async function getNextInvoiceSequence(businessId: string, year: number) {
  const rows = await prisma.$queryRaw<Array<{ maxSeq: number | null }>>(Prisma.sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART("orderNumber", '-', 3) AS INT)), 0)::int AS "maxSeq"
    FROM orders
    WHERE "businessId" = ${businessId}
      AND "orderNumber" LIKE ${`INV-${year}-%`}
  `)
  return (rows[0]?.maxSeq ?? 0) + 1
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
