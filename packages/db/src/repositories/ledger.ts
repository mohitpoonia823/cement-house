import { Prisma } from '@prisma/client'
import { prisma } from '../client'
import { postCustomerReceiptVoucher } from './accounting'

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

// The khata statement, read from the double-entry journal (the system of
// record). Each row is the customer-account leg of a voucher: debit = udhar
// (sale), credit = payment/return/adjustment. `reference` hides legacy rows
// where the idempotency key (khata entry id) was stored in the reference
// column; `paymentMode` falls back to inferring Cash from the counterpart
// account for vouchers posted before the paymentMode column existed.
export async function getLedgerEntriesByCustomer(customerId: string, businessId: string) {
  return prisma.$queryRaw<LedgerEntryWithOrderRow[]>`
    SELECT
      je.id,
      la."customerId" AS "customerId",
      je."orderId" AS "orderId",
      CASE WHEN jl.debit > 0 THEN 'DEBIT' ELSE 'CREDIT' END AS type,
      (CASE WHEN jl.debit > 0 THEN jl.debit ELSE jl.credit END)::double precision AS amount,
      COALESCE(
        je."paymentMode",
        CASE
          WHEN je."voucherType" <> 'RECEIPT' THEN NULL
          WHEN EXISTS (
            SELECT 1 FROM journal_lines jlc
            JOIN ledger_accounts lac ON lac.id = jlc."accountId"
            WHERE jlc."entryId" = je.id AND jlc.debit > 0 AND lac.name = 'Cash'
          ) THEN 'CASH'
          ELSE NULL
        END
      ) AS "paymentMode",
      CASE WHEN je.reference = je."ledgerEntryId" THEN NULL ELSE je.reference END AS reference,
      je.narration AS notes,
      je."createdById" AS "recordedById",
      je.date AS "createdAt",
      je."businessId" AS "businessId",
      CASE
        WHEN o.id IS NULL THEN NULL
        ELSE json_build_object('orderNumber', o."orderNumber")
      END AS "order"
    FROM ledger_accounts la
    JOIN journal_lines jl ON jl."accountId" = la.id
    JOIN journal_entries je ON je.id = jl."entryId"
    LEFT JOIN orders o ON o.id = je."orderId"
    WHERE la."businessId" = ${businessId} AND la."customerId" = ${customerId}
      AND (jl.debit > 0 OR jl.credit > 0)
    ORDER BY je.date ASC, je."createdAt" ASC
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
        la."customerId",
        SUM(jl.debit)::double precision AS debit,
        SUM(jl.credit)::double precision AS credit
      FROM ledger_accounts la
      JOIN journal_lines jl ON jl."accountId" = la.id
      WHERE la."businessId" = ${businessId} AND la."customerId" IS NOT NULL
      GROUP BY la."customerId"
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

    // Mirror the receipt into the double-entry ledger (Dr Cash/Bank, Cr
    // Customer — CREDIT-mode adjustments debit Khata Adjustment instead).
    const custRows = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT name FROM customers WHERE id = ${input.customerId} AND "businessId" = ${input.businessId} LIMIT 1
    `)
    await postCustomerReceiptVoucher(tx, {
      businessId: input.businessId,
      createdById: input.recordedById,
      customerId: input.customerId,
      customerName: custRows[0]?.name ?? 'Customer',
      amount: input.amount,
      paymentMode: input.paymentMode,
      date: new Date(),
      reference: input.reference ?? null,
      orderId: input.orderId ?? null,
      ledgerEntryId: ledger.id,
      narration: input.notes ?? null,
    })

    if (input.orderId) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE orders
        SET "amountPaid" = "amountPaid" + ${input.amount},
            "paidAmount" = COALESCE("paidAmount", "amountPaid") + ${input.amount},
            "dueAmount" = GREATEST(0, COALESCE("grandTotal", "totalAmount") - (COALESCE("paidAmount", "amountPaid") + ${input.amount})),
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
            "paidAmount" = COALESCE("paidAmount", "amountPaid") + ${applied},
            "dueAmount" = GREATEST(0, COALESCE("grandTotal", "totalAmount") - (COALESCE("paidAmount", "amountPaid") + ${applied})),
            "updatedAt" = NOW()
        WHERE id = ${order.id}
          AND "businessId" = ${input.businessId}
      `)
      remaining -= applied
    }

    return ledger
  }, { maxWait: 15_000, timeout: 60_000 })
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
