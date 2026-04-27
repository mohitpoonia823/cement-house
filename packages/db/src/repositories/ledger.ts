import { Prisma } from '@prisma/client'
import { prisma } from '../client'

export interface LedgerEntryWithOrderRow {
  id: string
  customerId: string
  orderId: string | null
  type: 'DEBIT' | 'CREDIT'
  amount: number
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL' | null
  reference: string | null
  notes: string | null
  recordedById: string
  createdAt: Date
  businessId: string
  order: { orderNumber: string } | null
}

export interface LedgerSummaryRow {
  customerId: string
  customerName: string
  phone: string
  balance: number
  riskTag: 'RELIABLE' | 'WATCH' | 'BLOCKED'
}

export interface CustomerBasicRow {
  id: string
  name: string
  phone: string
}

export interface CreatedLedgerPaymentRow {
  id: string
  customerId: string
  orderId: string | null
  type: 'DEBIT' | 'CREDIT'
  amount: number
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL' | null
  reference: string | null
  notes: string | null
  recordedById: string
  createdAt: Date
  businessId: string
}

interface RecordPaymentInput {
  customerId: string
  amount: number
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  reference?: string
  notes?: string
  orderId?: string
  recordedById: string
  businessId: string
}

export async function getLedgerEntriesByCustomer(customerId: string, businessId: string) {
  return prisma.$queryRaw<LedgerEntryWithOrderRow[]>`
    SELECT
      le.id,
      le."customerId" AS "customerId",
      le."orderId" AS "orderId",
      le.type::text AS type,
      le.amount::double precision AS amount,
      le."paymentMode"::text AS "paymentMode",
      le.reference,
      le.notes,
      le."recordedById" AS "recordedById",
      le."createdAt" AS "createdAt",
      le."businessId" AS "businessId",
      CASE
        WHEN o.id IS NULL THEN NULL
        ELSE json_build_object('orderNumber', o."orderNumber")
      END AS "order"
    FROM ledger_entries le
    LEFT JOIN orders o ON o.id = le."orderId"
    WHERE le."customerId" = ${customerId} AND le."businessId" = ${businessId}
    ORDER BY le."createdAt" ASC
  `
}

export async function getLedgerSummaryAll(businessId: string) {
  return prisma.$queryRaw<LedgerSummaryRow[]>`
    SELECT
      c.id AS "customerId",
      c.name AS "customerName",
      c.phone,
      (COALESCE(l.debit, 0) - COALESCE(l.credit, 0))::double precision AS balance,
      c."riskTag"::text AS "riskTag"
    FROM customers c
    LEFT JOIN (
      SELECT
        "customerId",
        SUM(CASE WHEN type = 'DEBIT'::"LedgerEntryType" THEN amount ELSE 0 END)::double precision AS debit,
        SUM(CASE WHEN type = 'CREDIT'::"LedgerEntryType" THEN amount ELSE 0 END)::double precision AS credit
      FROM ledger_entries
      WHERE "businessId" = ${businessId}
      GROUP BY "customerId"
    ) l ON l."customerId" = c.id
    WHERE c."isActive" = true AND c."businessId" = ${businessId}
      AND (COALESCE(l.debit, 0) - COALESCE(l.credit, 0)) <> 0
    ORDER BY c.name ASC
  `
}

export async function recordPaymentAndApply(input: RecordPaymentInput) {
  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<CreatedLedgerPaymentRow[]>(Prisma.sql`
      INSERT INTO ledger_entries (
        "customerId",
        "orderId",
        type,
        amount,
        "paymentMode",
        reference,
        notes,
        "recordedById",
        "createdAt",
        "businessId"
      ) VALUES (
        ${input.customerId},
        ${input.orderId ?? null},
        'CREDIT'::"LedgerEntryType",
        ${input.amount},
        ${input.paymentMode}::"PaymentMode",
        ${input.reference ?? null},
        ${input.notes ?? null},
        ${input.recordedById},
        NOW(),
        ${input.businessId}
      )
      RETURNING
        id,
        "customerId" AS "customerId",
        "orderId" AS "orderId",
        type::text AS type,
        amount::double precision AS amount,
        "paymentMode"::text AS "paymentMode",
        reference,
        notes,
        "recordedById" AS "recordedById",
        "createdAt" AS "createdAt",
        "businessId" AS "businessId"
    `)

    const ledger = inserted[0]

    if (input.orderId) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE orders
        SET "amountPaid" = "amountPaid" + ${input.amount},
            "updatedAt" = NOW()
        WHERE id = ${input.orderId}
          AND "businessId" = ${input.businessId}
      `)
      return ledger
    }

    const unpaidOrders = await tx.$queryRaw<Array<{ id: string; totalAmount: number; amountPaid: number }>>(Prisma.sql`
      SELECT
        id,
        "totalAmount"::double precision AS "totalAmount",
        "amountPaid"::double precision AS "amountPaid"
      FROM orders
      WHERE "customerId" = ${input.customerId}
        AND "businessId" = ${input.businessId}
        AND status <> 'CANCELLED'::"OrderStatus"
      ORDER BY "createdAt" ASC
    `)

    let remaining = input.amount
    for (const order of unpaidOrders) {
      if (remaining <= 0) break
      const due = order.totalAmount - order.amountPaid
      if (due <= 0) continue
      const applied = Math.min(remaining, due)
      await tx.$executeRaw(Prisma.sql`
        UPDATE orders
        SET "amountPaid" = "amountPaid" + ${applied},
            "updatedAt" = NOW()
        WHERE id = ${order.id}
      `)
      remaining -= applied
    }

    return ledger
  })
}

export async function getCustomerBasicById(customerId: string, businessId: string) {
  const rows = await prisma.$queryRaw<CustomerBasicRow[]>`
    SELECT id, name, phone
    FROM customers
    WHERE id = ${customerId} AND "businessId" = ${businessId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}
