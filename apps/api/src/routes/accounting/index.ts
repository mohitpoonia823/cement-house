import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { accountingRepository } from '@cement-house/db'
import { getBizId, requireOwner } from '../../middleware/auth'
import { buildGstr1PortalJson } from '../../services/gst-portal'
import { formatZodError } from '../../utils/validation'

const DateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

const DayBookQuerySchema = DateRangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const AccountLedgerQuerySchema = DateRangeSchema.extend({
  accountId: z.string().min(1),
})

const AsOfSchema = z.object({
  asOf: z.string().optional(),
})

const RecordExpenseSchema = z.object({
  accountName: z.string().trim().min(2),
  amount: z.number().positive(),
  paidVia: z.enum(['CASH', 'BANK']),
  date: z.string().optional(),
  reference: z.string().optional(),
  narration: z.string().optional(),
})

const RecordContraSchema = z.object({
  direction: z.enum(['CASH_TO_BANK', 'BANK_TO_CASH']),
  amount: z.number().positive(),
  date: z.string().optional(),
  reference: z.string().optional(),
  narration: z.string().optional(),
})

function parseDate(value?: string) {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

const PeriodSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

// Default period = current month if not provided.
function resolvePeriod(q: { startDate?: string; endDate?: string }) {
  const now = new Date()
  const start = parseDate(q.startDate) ?? new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = parseDate(q.endDate) ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

export async function accountingRoutes(app: FastifyInstance) {
  app.get('/day-book', async (req, reply) => {
    const bizId = getBizId(req)
    const query = DayBookQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })

    const data = await accountingRepository.getDayBook({
      businessId: bizId,
      startDate: parseDate(query.data.startDate),
      endDate: parseDate(query.data.endDate),
      limit: query.data.limit,
      offset: query.data.offset,
    })
    return { success: true, data }
  })

  app.get('/account-ledger', async (req, reply) => {
    const bizId = getBizId(req)
    const query = AccountLedgerQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })

    const data = await accountingRepository.getAccountLedger({
      businessId: bizId,
      accountId: query.data.accountId,
      startDate: parseDate(query.data.startDate),
      endDate: parseDate(query.data.endDate),
    })
    if (!data) return reply.status(404).send({ success: false, error: 'Account not found' })
    return { success: true, data }
  })

  app.get('/trial-balance', async (req, reply) => {
    const bizId = getBizId(req)
    const query = AsOfSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })

    const data = await accountingRepository.getTrialBalance({
      businessId: bizId,
      asOf: parseDate(query.data.asOf),
    })
    return { success: true, data }
  })

  // Expense heads for the picker (seeds defaults on first call).
  app.get('/expense-accounts', async (req) => {
    const bizId = getBizId(req)
    const data = await accountingRepository.listExpenseAccounts(bizId)
    return { success: true, data }
  })

  // Cash & Bank balances + recent cash/expense/contra vouchers.
  app.get('/expenses', async (req) => {
    const bizId = getBizId(req)
    const [balances, vouchers] = await Promise.all([
      accountingRepository.getCashBankBalances(bizId),
      accountingRepository.listVouchers({ businessId: bizId, types: ['EXPENSE', 'CONTRA'], limit: 100 }),
    ])
    return { success: true, data: { ...balances, vouchers } }
  })

  app.post('/expenses', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = RecordExpenseSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: formatZodError(body.error) })

    try {
      const entry = await accountingRepository.recordExpense({
        businessId: bizId,
        createdById: user.id,
        accountName: body.data.accountName,
        amount: body.data.amount,
        paidVia: body.data.paidVia,
        date: parseDate(body.data.date),
        reference: body.data.reference,
        narration: body.data.narration,
      })
      return { success: true, data: entry }
    } catch (error: any) {
      if (error.message === 'ACCOUNT_NAME_TAKEN') {
        return reply.status(409).send({ success: false, error: 'That name is already used by a non-expense account. Pick a different expense head.' })
      }
      throw error
    }
  })

  app.post('/contra', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = RecordContraSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: formatZodError(body.error) })

    const entry = await accountingRepository.recordContra({
      businessId: bizId,
      createdById: user.id,
      direction: body.data.direction,
      amount: body.data.amount,
      date: parseDate(body.data.date),
      reference: body.data.reference,
      narration: body.data.narration,
    })
    return { success: true, data: entry }
  })

  // ── Financial statements ─────────────────────────────────────────────────
  app.get('/profit-loss', async (req, reply) => {
    const bizId = getBizId(req)
    const query = PeriodSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })
    const { start, end } = resolvePeriod(query.data)
    const data = await accountingRepository.getProfitAndLoss({ businessId: bizId, start, end })
    return { success: true, data }
  })

  app.get('/balance-sheet', async (req, reply) => {
    const bizId = getBizId(req)
    const query = AsOfSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })
    const asOf = parseDate(query.data.asOf) ?? new Date()
    const data = await accountingRepository.getBalanceSheet({ businessId: bizId, asOf })
    return { success: true, data }
  })

  app.get('/payables-aging', async (req, reply) => {
    const bizId = getBizId(req)
    const query = AsOfSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })
    const asOf = parseDate(query.data.asOf) ?? new Date()
    const data = await accountingRepository.getPayablesAging({ businessId: bizId, asOf })
    return { success: true, data }
  })

  // ── GST returns ──────────────────────────────────────────────────────────
  app.get('/gstr1', async (req, reply) => {
    const bizId = getBizId(req)
    const query = PeriodSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })
    const { start, end } = resolvePeriod(query.data)
    const data = await accountingRepository.getGstr1({ businessId: bizId, start, end })
    return { success: true, data }
  })

  // GST-portal (offline tool) GSTR-1 JSON with invoice-level B2B/CDNR detail.
  app.get('/gstr1/portal', async (req, reply) => {
    const bizId = getBizId(req)
    const query = PeriodSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })
    const { start, end } = resolvePeriod(query.data)
    const data = await accountingRepository.getGstr1InvoiceLevel({ businessId: bizId, start, end })
    const result = buildGstr1PortalJson({ data, periodStart: start })
    if ('error' in result) return reply.status(400).send({ success: false, error: result.error })
    return { success: true, data: result }
  })

  app.get('/gstr3b', async (req, reply) => {
    const bizId = getBizId(req)
    const query = PeriodSchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: formatZodError(query.error) })
    const { start, end } = resolvePeriod(query.data)
    const data = await accountingRepository.getGstr3b({ businessId: bizId, start, end })
    return { success: true, data }
  })

  // One-time: import historical sales & receipts into the double-entry journal.
  app.post('/backfill', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const data = await accountingRepository.backfillSalesAndReceipts({ businessId: bizId, createdById: user.id })
    return { success: true, data }
  })

  // Khata ↔ journal reconciliation: per-customer khata balance vs journal
  // Sundry Debtors balance. Any nonzero diff means the two ledgers diverged.
  app.get('/reconciliation', async (req) => {
    const bizId = getBizId(req)
    const data = await accountingRepository.getKhataJournalReconciliation(bizId)
    return { success: true, data }
  })

  // ── Opening balances (Cash / Bank) ───────────────────────────────────────
  app.get('/opening-balances', async (req) => {
    const bizId = getBizId(req)
    const data = await accountingRepository.getOpeningBalances(bizId)
    return { success: true, data }
  })

  app.post('/opening-balances', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = z.object({
      account: z.enum(['Cash', 'Bank']),
      amount: z.number().min(0).max(1_000_000_000),
    }).safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: formatZodError(body.error) })

    const data = await accountingRepository.setOpeningBalance({
      businessId: bizId,
      createdById: user.id,
      account: body.data.account,
      amount: body.data.amount,
    })
    return { success: true, data }
  })
}
