import { Prisma } from '@prisma/client'
import { prisma } from '../client'

export interface DeliveryItemWithMaterialRow {
  id: string
  deliveryId: string
  materialId: string
  orderedQty: number
  deliveredQty: number
  material: {
    id: string
    name: string
    unit: string
    stockQty: number
    minThreshold: number
    maxThreshold: number | null
    purchasePrice: number
    salePrice: number
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    businessId: string
  } | null
}

export interface DeliveryWithOrderRow {
  id: string
  orderId: string
  challanNumber: string
  driverName: string | null
  vehicleNumber: string | null
  status: 'SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
  confirmationType: 'OTP' | 'PHOTO' | 'MANUAL' | null
  confirmationRef: string | null
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
  order: any
  items: DeliveryItemWithMaterialRow[]
}

export interface DeliveryOrderLiteRow {
  id: string
  status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'
  orderNumber: string
}

function baseDeliverySelect() {
  return Prisma.sql`
    SELECT
      d.id,
      d."orderId" AS "orderId",
      d."challanNumber" AS "challanNumber",
      d."driverName" AS "driverName",
      d."vehicleNumber" AS "vehicleNumber",
      d.status::text AS status,
      d."confirmationType"::text AS "confirmationType",
      d."confirmationRef" AS "confirmationRef",
      d."deliveredAt" AS "deliveredAt",
      d."createdAt" AS "createdAt",
      d."updatedAt" AS "updatedAt",
      json_build_object(
        'id', o.id,
        'orderNumber', o."orderNumber",
        'customerId', o."customerId",
        'createdById', o."createdById",
        'orderDate', o."orderDate",
        'deliveryDate', o."deliveryDate",
        'status', (o.status::text),
        'paymentMode', (o."paymentMode"::text),
        'amountPaid', (o."amountPaid"::double precision),
        'totalAmount', (o."totalAmount"::double precision),
        'marginPct', (o."marginPct"::double precision),
        'notes', o.notes,
        'isDeleted', o."isDeleted",
        'createdAt', o."createdAt",
        'updatedAt', o."updatedAt",
        'businessId', o."businessId",
        'customer', json_build_object(
          'name', c.name,
          'phone', c.phone,
          'address', c.address
        )
      ) AS "order",
      COALESCE(
        json_agg(
          json_build_object(
            'id', di.id,
            'deliveryId', di."deliveryId",
            'materialId', di."materialId",
            'orderedQty', (di."orderedQty"::double precision),
            'deliveredQty', (di."deliveredQty"::double precision),
            'material', CASE WHEN m.id IS NULL THEN NULL ELSE json_build_object(
              'id', m.id,
              'name', m.name,
              'unit', m.unit,
              'stockQty', (m."stockQty"::double precision),
              'minThreshold', (m."minThreshold"::double precision),
              'maxThreshold', (m."maxThreshold"::double precision),
              'purchasePrice', (m."purchasePrice"::double precision),
              'salePrice', (m."salePrice"::double precision),
              'isActive', m."isActive",
              'createdAt', m."createdAt",
              'updatedAt', m."updatedAt",
              'businessId', m."businessId"
            ) END
          )
        ) FILTER (WHERE di.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM deliveries d
    INNER JOIN orders o ON o.id = d."orderId"
    INNER JOIN customers c ON c.id = o."customerId"
    LEFT JOIN delivery_items di ON di."deliveryId" = d.id
    LEFT JOIN materials m ON m.id = di."materialId"
  `
}

export async function listDeliveries(businessId: string, status?: string, date?: string) {
  const filters: Prisma.Sql[] = [Prisma.sql`o."businessId" = ${businessId}`, Prisma.sql`o."isDeleted" = false`]
  if (status) filters.push(Prisma.sql`d.status = ${status}::"DeliveryStatus"`)
  if (date) {
    const start = new Date(date)
    const next = new Date(start)
    next.setDate(next.getDate() + 1)
    filters.push(Prisma.sql`d."createdAt" >= ${start} AND d."createdAt" < ${next}`)
  }

  return prisma.$queryRaw<DeliveryWithOrderRow[]>(Prisma.sql`
    ${baseDeliverySelect()}
    WHERE ${Prisma.join(filters, ' AND ')}
    GROUP BY d.id, o.id, c.id
    ORDER BY d."createdAt" DESC
  `)
}

export async function getDeliveryById(id: string, businessId: string) {
  const rows = await prisma.$queryRaw<DeliveryWithOrderRow[]>(Prisma.sql`
    ${baseDeliverySelect()}
    WHERE d.id = ${id} AND o."businessId" = ${businessId} AND o."isDeleted" = false
    GROUP BY d.id, o.id, c.id
    LIMIT 1
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function getOrderForDelivery(orderId: string, businessId: string) {
  const rows = await prisma.$queryRaw<DeliveryOrderLiteRow[]>`
    SELECT
      id,
      status::text AS status,
      "orderNumber" AS "orderNumber"
    FROM orders
    WHERE id = ${orderId} AND "businessId" = ${businessId} AND "isDeleted" = false
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function createDeliveryAndDispatch(input: {
  orderId: string
  challanNumber: string
  driverName?: string
  vehicleNumber?: string
  items: Array<{ materialId: string; orderedQty: number; deliveredQty: number }>
}) {
  const deliveryRows = await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO deliveries (
        "orderId",
        "challanNumber",
        "driverName",
        "vehicleNumber",
        status,
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${input.orderId},
        ${input.challanNumber},
        ${input.driverName ?? null},
        ${input.vehicleNumber ?? null},
        'SCHEDULED'::"DeliveryStatus",
        NOW(),
        NOW()
      )
      RETURNING id
    `)

    const deliveryId = inserted[0]?.id
    if (!deliveryId) throw new Error('Failed to create delivery')

    for (const item of input.items) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO delivery_items (
          "deliveryId",
          "materialId",
          "orderedQty",
          "deliveredQty"
        ) VALUES (
          ${deliveryId},
          ${item.materialId},
          ${item.orderedQty},
          ${item.deliveredQty}
        )
      `)
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET status = 'DISPATCHED'::"OrderStatus", "updatedAt" = NOW()
      WHERE id = ${input.orderId}
    `)

    return inserted
  })

  const deliveryId = deliveryRows[0]?.id
  if (!deliveryId) return null

  const rows = await prisma.$queryRaw<DeliveryWithOrderRow[]>(Prisma.sql`
    ${baseDeliverySelect()}
    WHERE d.id = ${deliveryId}
    GROUP BY d.id, o.id, c.id
    LIMIT 1
  `)

  return rows.length > 0 ? rows[0] : null
}

export async function updateDeliveryStatus(id: string, status: 'IN_TRANSIT' | 'FAILED') {
  const rows = await prisma.$queryRaw<Array<{ id: string; orderId: string; status: string }>>(Prisma.sql`
    UPDATE deliveries
    SET status = ${status}::"DeliveryStatus", "updatedAt" = NOW()
    WHERE id = ${id}
    RETURNING id, "orderId" AS "orderId", status::text AS status
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function confirmDelivery(input: {
  id: string
  confirmationType: 'OTP' | 'PHOTO' | 'MANUAL'
  confirmationRef?: string
}) {
  const rows = await prisma.$transaction(async (tx) => {
    const updated = await tx.$queryRaw<Array<{ id: string; orderId: string }>>(Prisma.sql`
      UPDATE deliveries
      SET
        status = 'DELIVERED'::"DeliveryStatus",
        "confirmationType" = ${input.confirmationType}::"ConfirmationType",
        "confirmationRef" = ${input.confirmationRef ?? null},
        "deliveredAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${input.id}
      RETURNING id, "orderId" AS "orderId"
    `)

    const first = updated[0]
    if (!first) return []

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET status = 'DELIVERED'::"OrderStatus", "updatedAt" = NOW()
      WHERE id = ${first.orderId}
    `)

    return updated
  })

  return rows.length > 0 ? rows[0] : null
}

export async function failDelivery(id: string) {
  const rows = await prisma.$transaction(async (tx) => {
    const updated = await tx.$queryRaw<Array<{ id: string; orderId: string }>>(Prisma.sql`
      UPDATE deliveries
      SET status = 'FAILED'::"DeliveryStatus", "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING id, "orderId" AS "orderId"
    `)
    const first = updated[0]
    if (!first) return []

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET status = 'CONFIRMED'::"OrderStatus", "updatedAt" = NOW()
      WHERE id = ${first.orderId}
    `)

    return updated
  })

  return rows.length > 0 ? rows[0] : null
}

export async function listTodayDeliveries(businessId: string, start: Date, end: Date) {
  return prisma.$queryRaw<DeliveryWithOrderRow[]>(Prisma.sql`
    ${baseDeliverySelect()}
    WHERE d."createdAt" >= ${start}
      AND d."createdAt" <= ${end}
      AND o."businessId" = ${businessId}
      AND o."isDeleted" = false
    GROUP BY d.id, o.id, c.id
    ORDER BY d."createdAt" ASC
  `)
}
