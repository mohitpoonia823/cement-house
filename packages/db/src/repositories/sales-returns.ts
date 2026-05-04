import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'
import { adjustMaterialLocationStock, resolveSourceLocationId } from './multi-location'

export interface CreateSalesReturnInput {
  businessId: string
  orderId: string
  createdById: string
  reason?: string
  items: Array<{
    orderItemId: string
    quantityReturned: number
  }>
}

export async function getNextReturnSequence(businessId: string, year: number) {
  const rows = await prisma.$queryRaw<Array<{ maxSeq: number }>>(Prisma.sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART("returnNumber", '-', 3) AS INT)), 0)::int AS "maxSeq"
    FROM sales_returns
    WHERE "businessId" = ${businessId}
      AND "returnNumber" LIKE ${`SR-${year}-%`}
  `)
  return (rows[0]?.maxSeq ?? 0) + 1
}

export async function createSalesReturn(input: CreateSalesReturnInput) {
  const nowYear = new Date().getFullYear()
  const seq = await getNextReturnSequence(input.businessId, nowYear)
  const returnNumber = `SR-${nowYear}-${String(seq).padStart(6, '0')}`

  return prisma.$transaction(async (tx) => {
    const orderRows = await tx.$queryRaw<Array<{ id: string; customerId: string; orderNumber: string; status: string; sourceLocationId: string | null }>>(Prisma.sql`
      SELECT id, "customerId" AS "customerId", "orderNumber" AS "orderNumber", status::text AS status, "sourceLocationId" AS "sourceLocationId"
      FROM orders
      WHERE id = ${input.orderId} AND "businessId" = ${input.businessId} AND "isDeleted" = false
      LIMIT 1
    `)
    const order = orderRows[0]
    if (!order) throw new Error('Order not found for this business')
    if (order.status !== 'DELIVERED') throw new Error('Only delivered orders can be returned')
    const restoreLocationId = await resolveSourceLocationId(input.businessId, order.sourceLocationId)

    const itemIds = input.items.map((i) => i.orderItemId)
    const orderItems = await tx.$queryRaw<Array<{
      id: string
      orderId: string
      materialId: string
      quantity: number
      unitPrice: number
      discountAmount: number | null
      taxableAmount: number | null
      gstAmount: number | null
      cgstAmount: number | null
      sgstAmount: number | null
      igstAmount: number | null
      lineTotal: number
    }>>(Prisma.sql`
      SELECT
        oi.id,
        oi."orderId" AS "orderId",
        oi."materialId" AS "materialId",
        oi.quantity::double precision AS quantity,
        oi."unitPrice"::double precision AS "unitPrice",
        oi."discountAmount"::double precision AS "discountAmount",
        oi."taxableAmount"::double precision AS "taxableAmount",
        oi."gstAmount"::double precision AS "gstAmount",
        oi."cgstAmount"::double precision AS "cgstAmount",
        oi."sgstAmount"::double precision AS "sgstAmount",
        oi."igstAmount"::double precision AS "igstAmount",
        oi."lineTotal"::double precision AS "lineTotal"
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi."orderId"
      WHERE oi.id IN (${Prisma.join(itemIds)})
        AND oi."orderId" = ${input.orderId}
        AND o."businessId" = ${input.businessId}
        AND o."isDeleted" = false
    `)
    if (orderItems.length !== itemIds.length) throw new Error('One or more return items are invalid for this order')

    const previousReturns = await tx.$queryRaw<Array<{ orderItemId: string; returnedQty: number }>>(Prisma.sql`
      SELECT
        sri."orderItemId" AS "orderItemId",
        COALESCE(SUM(sri."quantityReturned"), 0)::double precision AS "returnedQty"
      FROM sales_return_items sri
      INNER JOIN sales_returns sr ON sr.id = sri."returnId"
      WHERE sr."businessId" = ${input.businessId}
        AND sr."orderId" = ${input.orderId}
        AND sr.status <> 'CANCELLED'::"SalesReturnStatus"
      GROUP BY sri."orderItemId"
    `)
    const returnedMap = new Map(previousReturns.map((r) => [r.orderItemId, Number(r.returnedQty)]))

    const returnId = randomUUID()
    let totalReturnAmount = 0
    let totalGstReversal = 0
    const touchedMaterialIds: string[] = []

    for (const reqItem of input.items) {
      const src = orderItems.find((oi) => oi.id === reqItem.orderItemId)
      if (!src) throw new Error('Invalid order item in return payload')
      const qty = Number(reqItem.quantityReturned)
      if (!(qty > 0)) throw new Error('Return quantity must be greater than 0')
      const already = returnedMap.get(src.id) ?? 0
      if (already + qty > Number(src.quantity)) {
        throw new Error(`Return quantity exceeds sold quantity for item ${src.id}`)
      }

      const ratio = qty / Number(src.quantity)
      const discountAmount = Number(((src.discountAmount ?? 0) * ratio).toFixed(2))
      const taxableAmount = Number(((src.taxableAmount ?? (src.quantity * src.unitPrice)) * ratio).toFixed(2))
      const gstAmount = Number(((src.gstAmount ?? 0) * ratio).toFixed(2))
      const cgstAmount = Number(((src.cgstAmount ?? 0) * ratio).toFixed(2))
      const sgstAmount = Number(((src.sgstAmount ?? 0) * ratio).toFixed(2))
      const igstAmount = Number(((src.igstAmount ?? 0) * ratio).toFixed(2))
      const totalAmount = Number(((src.lineTotal ?? (taxableAmount + gstAmount)) * ratio).toFixed(2))

      totalReturnAmount += totalAmount
      totalGstReversal += gstAmount

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO sales_return_items (
          id, "returnId", "orderItemId", "materialId",
          "quantityReturned", "unitPrice", "discountAmount",
          "taxableAmount", "gstAmount", "totalAmount", "cgstAmount", "sgstAmount", "igstAmount"
        ) VALUES (
          ${randomUUID()}, ${returnId}, ${src.id}, ${src.materialId},
          ${qty}, ${src.unitPrice}, ${discountAmount},
          ${taxableAmount}, ${gstAmount}, ${totalAmount}, ${cgstAmount}, ${sgstAmount}, ${igstAmount}
        )
      `)

      touchedMaterialIds.push(src.materialId)
      await adjustMaterialLocationStock(tx, {
        businessId: input.businessId,
        materialId: src.materialId,
        locationId: restoreLocationId,
        deltaQty: qty,
        allowNegativeStock: true,
      })
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO stock_movements (
          id, "materialId", "orderId", type, quantity, "stockAfter", reason, "recordedById", "createdAt", "businessId"
        )
        SELECT
          ${randomUUID()}, m.id, ${input.orderId}, 'ADJUSTMENT'::"StockMovementType", ${qty},
          (m."stockQty")::double precision, ${`Sales return ${returnNumber} (${restoreLocationId})`}, ${input.createdById}, NOW(), ${input.businessId}
        FROM materials m
        WHERE m.id = ${src.materialId} AND m."businessId" = ${input.businessId}
      `)
    }

    const roundedReturn = Number(totalReturnAmount.toFixed(2))
    const roundedGst = Number(totalGstReversal.toFixed(2))

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO sales_returns (
        id, "businessId", "orderId", "customerId", "returnNumber", "returnDate", reason,
        "totalReturnAmount", "gstReversalAmount", "ledgerAdjustmentAmount", status, "createdById", "createdAt"
      ) VALUES (
        ${returnId}, ${input.businessId}, ${input.orderId}, ${order.customerId}, ${returnNumber}, NOW(), ${input.reason ?? null},
        ${roundedReturn}, ${roundedGst}, ${roundedReturn}, 'COMPLETED'::"SalesReturnStatus", ${input.createdById}, NOW()
      )
    `)

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id, "customerId", "orderId", type, amount, "paymentMode", "recordedById", notes, "createdAt", "businessId"
      ) VALUES (
        ${randomUUID()}, ${order.customerId}, ${input.orderId}, 'CREDIT'::"LedgerEntryType",
        ${roundedReturn}, 'PARTIAL'::"PaymentMode", ${input.createdById}, ${`Sales return ${returnNumber}`}, NOW(), ${input.businessId}
      )
    `)

    const totals = await tx.$queryRaw<Array<{ sold: number; returned: number }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(oi.quantity), 0)::double precision AS sold,
        COALESCE((
          SELECT SUM(sri."quantityReturned")
          FROM sales_return_items sri
          INNER JOIN sales_returns sr ON sr.id = sri."returnId"
          WHERE sr."orderId" = ${input.orderId}
            AND sr."businessId" = ${input.businessId}
            AND sr.status <> 'CANCELLED'::"SalesReturnStatus"
        ), 0)::double precision AS returned
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi."orderId"
      WHERE oi."orderId" = ${input.orderId} AND o."businessId" = ${input.businessId}
    `)
    const sold = Number(totals[0]?.sold ?? 0)
    const returned = Number(totals[0]?.returned ?? 0)
    const nextStatus = returned <= 0 ? 'NONE' : returned + 0.0001 >= sold ? 'FULL' : 'PARTIAL'

    await tx.$executeRaw(Prisma.sql`
      UPDATE orders
      SET
        "returnedAmount" = COALESCE("returnedAmount", 0) + ${roundedReturn},
        "returnStatus" = ${nextStatus}::"OrderReturnStatus",
        "dueAmount" = GREATEST(0, COALESCE("dueAmount", COALESCE("grandTotal", "totalAmount") - COALESCE("paidAmount", "amountPaid")) - ${roundedReturn}),
        "updatedAt" = NOW()
      WHERE id = ${input.orderId} AND "businessId" = ${input.businessId}
    `)

    const created = await tx.$queryRaw<Array<{ id: string; returnNumber: string }>>(Prisma.sql`
      SELECT id, "returnNumber" AS "returnNumber"
      FROM sales_returns
      WHERE id = ${returnId} AND "businessId" = ${input.businessId}
      LIMIT 1
    `)
    return created[0] ?? null
  })
}

export async function listSalesReturns(businessId: string) {
  return prisma.$queryRaw<Array<{
    id: string
    returnNumber: string
    returnDate: Date
    status: string
    totalReturnAmount: number
    customerName: string
    orderNumber: string
  }>>(Prisma.sql`
    SELECT
      sr.id,
      sr."returnNumber" AS "returnNumber",
      sr."returnDate" AS "returnDate",
      sr.status::text AS status,
      sr."totalReturnAmount"::double precision AS "totalReturnAmount",
      c.name AS "customerName",
      o."orderNumber" AS "orderNumber"
    FROM sales_returns sr
    INNER JOIN customers c ON c.id = sr."customerId"
    INNER JOIN orders o ON o.id = sr."orderId"
    WHERE sr."businessId" = ${businessId}
    ORDER BY sr."createdAt" DESC
  `)
}

export async function getSalesReturnDetail(returnId: string, businessId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; returnNumber: string; returnDate: Date; reason: string | null; status: string; totalReturnAmount: number; gstReversalAmount: number; ledgerAdjustmentAmount: number; orderNumber: string; customerName: string; items: unknown }>>(Prisma.sql`
    SELECT
      sr.id,
      sr."returnNumber" AS "returnNumber",
      sr."returnDate" AS "returnDate",
      sr.reason,
      sr.status::text AS status,
      sr."totalReturnAmount"::double precision AS "totalReturnAmount",
      sr."gstReversalAmount"::double precision AS "gstReversalAmount",
      sr."ledgerAdjustmentAmount"::double precision AS "ledgerAdjustmentAmount",
      o."orderNumber" AS "orderNumber",
      c.name AS "customerName",
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', sri.id,
          'orderItemId', sri."orderItemId",
          'materialId', sri."materialId",
          'quantityReturned', sri."quantityReturned"::double precision,
          'unitPrice', sri."unitPrice"::double precision,
          'discountAmount', sri."discountAmount"::double precision,
          'taxableAmount', sri."taxableAmount"::double precision,
          'gstAmount', sri."gstAmount"::double precision,
          'totalAmount', sri."totalAmount"::double precision
        ))
        FROM sales_return_items sri
        WHERE sri."returnId" = sr.id
      ), '[]'::json) AS items
    FROM sales_returns sr
    INNER JOIN orders o ON o.id = sr."orderId"
    INNER JOIN customers c ON c.id = sr."customerId"
    WHERE sr.id = ${returnId} AND sr."businessId" = ${businessId}
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  return {
    ...row,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
  }
}
