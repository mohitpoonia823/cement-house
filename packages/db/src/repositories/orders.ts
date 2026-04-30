import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'

export interface OrderListItemRow {
  id: string
  orderNumber: string
  customerId: string
  createdById: string
  orderDate: Date
  deliveryDate: Date | null
  status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
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
  customerId: string
  createdById: string
  orderDate: Date
  deliveryDate: Date | null
  status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
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
        o."customerId" AS "customerId",
        o."createdById" AS "createdById",
        o."orderDate" AS "orderDate",
        o."deliveryDate" AS "deliveryDate",
        o.status::text AS status,
        o."paymentMode"::text AS "paymentMode",
        o."amountPaid"::double precision AS "amountPaid",
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
      o."customerId" AS "customerId",
      o."createdById" AS "createdById",
      o."orderDate" AS "orderDate",
      o."deliveryDate" AS "deliveryDate",
      o.status::text AS status,
      o."paymentMode"::text AS "paymentMode",
      o."amountPaid"::double precision AS "amountPaid",
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
  customerId: string
  createdById: string
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  amountPaid: number
  totalAmount: number
  marginPct: number
  notes?: string
  businessId: string
  deliveryDate?: string
  items: Array<{ materialId: string; quantity: number; unitPrice: number; purchasePrice: number }>
}) {
  const newOrderId = randomUUID()
  const rows = await prisma.$transaction(async (tx) => {
    const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO orders (
        id,
        "orderNumber",
        "customerId",
        "createdById",
        "paymentMode",
        "amountPaid",
        "totalAmount",
        "marginPct",
        notes,
        "businessId",
        "deliveryDate",
        "orderDate",
        status,
        "isDeleted",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${newOrderId},
        ${input.orderNumber},
        ${input.customerId},
        ${input.createdById},
        ${input.paymentMode}::"PaymentMode",
        ${input.amountPaid},
        ${input.totalAmount},
        ${input.marginPct},
        ${input.notes ?? null},
        ${input.businessId},
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
      const lineTotal = item.quantity * item.unitPrice
      const orderItemId = randomUUID()
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO order_items (
          id,
          "orderId",
          "materialId",
          quantity,
          "unitPrice",
          "purchasePrice",
          "lineTotal"
        ) VALUES (
          ${orderItemId},
          ${createdOrderId},
          ${item.materialId},
          ${item.quantity},
          ${item.unitPrice},
          ${item.purchasePrice},
          ${lineTotal}
        )
      `)

      const mats = await tx.$queryRaw<Array<{ stockQty: number }>>(Prisma.sql`
        SELECT "stockQty"::double precision AS "stockQty"
        FROM materials
        WHERE id = ${item.materialId}
        LIMIT 1
      `)
      const material = mats[0]
      if (!material) throw new Error(`Material ${item.materialId} not found`)

      const stockAfter = material.stockQty - item.quantity
      await tx.$executeRaw(Prisma.sql`
        UPDATE materials
        SET "stockQty" = ${stockAfter}, "updatedAt" = NOW()
        WHERE id = ${item.materialId}
      `)

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
          ${item.quantity},
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
  })

  const createdId = rows[0]?.id
  if (!createdId) return null

  const row = await prisma.$queryRaw<Array<{ id: string; orderNumber: string }>>(Prisma.sql`
    SELECT id, "orderNumber" AS "orderNumber"
    FROM orders
    WHERE id = ${createdId}
    LIMIT 1
  `)
  return row[0] ?? null
}

export async function appendItemToOrder(input: {
  orderId: string
  businessId: string
  materialId: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  userId: string
  orderNumber: string
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  customerId: string
}) {
  await prisma.$transaction(async (tx) => {
    const lineTotal = input.quantity * input.unitPrice
    const orderItemId = randomUUID()
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO order_items (
        id,
        "orderId",
        "materialId",
        quantity,
        "unitPrice",
        "purchasePrice",
        "lineTotal"
      ) VALUES (
        ${orderItemId},
        ${input.orderId},
        ${input.materialId},
        ${input.quantity},
        ${input.unitPrice},
        ${input.purchasePrice},
        ${lineTotal}
      )
    `)

    const totals = await tx.$queryRaw<Array<{ total: number; margin: number }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(quantity * "unitPrice"), 0)::double precision AS total,
        COALESCE(AVG((CASE WHEN "purchasePrice" = 0 THEN 0 ELSE ("unitPrice" - "purchasePrice") / "purchasePrice" * 100 END)), 0)::double precision AS margin
      FROM order_items
      WHERE "orderId" = ${input.orderId}
    `)

    const agg = totals[0] ?? { total: 0, margin: 0 }
    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET "totalAmount" = ${agg.total}, "marginPct" = ${agg.margin}, "updatedAt" = NOW()
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

    const mats = await tx.$queryRaw<Array<{ stockQty: number }>>(Prisma.sql`
      SELECT "stockQty"::double precision AS "stockQty"
      FROM materials
      WHERE id = ${input.materialId}
      LIMIT 1
    `)
    const material = mats[0]
    if (!material) throw new Error('Material not found')
    const stockAfter = material.stockQty - input.quantity

    await tx.$executeRaw(Prisma.sql`
      UPDATE materials
      SET "stockQty" = ${stockAfter}, "updatedAt" = NOW()
      WHERE id = ${input.materialId}
    `)

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
        ${input.quantity},
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

export async function createDispatchDelivery(orderId: string, challanNumber: string) {
  await prisma.$transaction(async (tx) => {
    const items = await tx.$queryRaw<Array<{ materialId: string; quantity: number }>>(Prisma.sql`
      SELECT "materialId" AS "materialId", quantity::double precision AS quantity
      FROM order_items
      WHERE "orderId" = ${orderId}
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
      WHERE id = ${orderId}
    `)
  }, { maxWait: 10000, timeout: 15000 })
}

export async function markDeliveredAndCloseDeliveries(orderId: string, deliveryIds: string[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET status = 'DELIVERED'::"OrderStatus", "updatedAt" = NOW()
      WHERE id = ${orderId}
    `)

    if (deliveryIds.length > 0) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE deliveries
        SET status = 'DELIVERED'::"DeliveryStatus", "deliveredAt" = NOW(), "updatedAt" = NOW()
        WHERE id IN (${Prisma.join(deliveryIds)})
          AND status <> 'DELIVERED'::"DeliveryStatus"
          AND status <> 'FAILED'::"DeliveryStatus"
      `)
    }
  }, { maxWait: 10000, timeout: 15000 })
}

export async function softDeleteOrder(orderId: string, businessId: string) {
  await prisma.$transaction(async (tx) => {
    const items = await tx.$queryRaw<Array<{ materialId: string; quantity: number }>>(Prisma.sql`
      SELECT "materialId" AS "materialId", quantity::double precision AS quantity
      FROM order_items
      WHERE "orderId" = ${orderId}
    `)

    for (const item of items) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE materials
        SET "stockQty" = "stockQty" + ${item.quantity}, "updatedAt" = NOW()
        WHERE id = ${item.materialId}
      `)
    }

    await tx.$executeRaw(Prisma.sql`DELETE FROM stock_movements WHERE "orderId" = ${orderId}`)
    await tx.$executeRaw(Prisma.sql`DELETE FROM ledger_entries WHERE "orderId" = ${orderId}`)

    await tx.$executeRaw(Prisma.sql`
      DELETE FROM delivery_items
      WHERE "deliveryId" IN (SELECT id FROM deliveries WHERE "orderId" = ${orderId})
    `)
    await tx.$executeRaw(Prisma.sql`DELETE FROM deliveries WHERE "orderId" = ${orderId}`)

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET "isDeleted" = true, "updatedAt" = NOW()
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
