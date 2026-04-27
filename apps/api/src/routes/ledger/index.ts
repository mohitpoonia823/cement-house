import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ledgerRepository } from '@cement-house/db'
import { getBizId } from '../../middleware/auth'

const CustomerIdParamsSchema = z.object({
  customerId: z.string().uuid(),
})

const RecordPaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMode: z.enum(['CASH', 'UPI', 'CHEQUE', 'CREDIT', 'PARTIAL']),
  reference: z.string().optional(),
  notes: z.string().optional(),
  orderId: z.string().uuid().optional(),
})

export async function ledgerRoutes(app: FastifyInstance) {
  app.get('/summary/all', async (req) => {
    const bizId = getBizId(req)
    const summaries = await ledgerRepository.getLedgerSummaryAll(bizId)
    return { success: true, data: summaries }
  })

  app.get('/:customerId', async (req, reply) => {
    const bizId = getBizId(req)
    const params = CustomerIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const entries = await ledgerRepository.getLedgerEntriesByCustomer(params.data.customerId, bizId)

    let balance = 0
    const withBalance = entries.map((entry) => {
      balance += entry.type === 'DEBIT' ? Number(entry.amount) : -Number(entry.amount)
      return { ...entry, runningBalance: balance }
    })

    return { success: true, data: { entries: withBalance, currentBalance: balance } }
  })

  app.post('/payment', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = RecordPaymentSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const entry = await ledgerRepository.recordPaymentAndApply({
      ...body.data,
      recordedById: user.id,
      businessId: bizId,
    })

    return { success: true, data: entry }
  })
}

function csvCell(value: string | number) {
  const str = String(value)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function toCsv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

export async function ledgerStatementRoute(app: FastifyInstance) {
  app.get('/:customerId/statement', async (req, reply) => {
    const bizId = getBizId(req)
    const params = CustomerIdParamsSchema.safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: params.error.message })

    const customer = await ledgerRepository.getCustomerBasicById(params.data.customerId, bizId)
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })

    const entries = await ledgerRepository.getLedgerEntriesByCustomer(params.data.customerId, bizId)

    let balance = 0
    const rows = entries.map((entry) => {
      const amount = Number(entry.amount)
      balance += entry.type === 'DEBIT' ? amount : -amount
      return {
        date: entry.createdAt,
        description: entry.notes ?? (entry.order ? `Order ${entry.order.orderNumber}` : entry.type),
        debit: entry.type === 'DEBIT' ? amount : null,
        credit: entry.type === 'CREDIT' ? amount : null,
        balance,
      }
    })

    const csvRows: Array<Array<string | number>> = [
      ['Customer', customer.name],
      ['Phone', customer.phone ?? '-'],
      ['Generated At', new Date().toISOString()],
      ['Current Balance', balance],
      [],
      ['Date', 'Description', 'Debit (sale)', 'Credit (paid)', 'Balance'],
      ...rows.map((entry) => [
        new Date(entry.date).toISOString(),
        entry.description,
        entry.debit ?? '',
        entry.credit ?? '',
        entry.balance,
      ]),
    ]

    const fileSafeName = customer.name.trim().replace(/\s+/g, '-').toLowerCase() || 'customer'
    const csv = toCsv(csvRows)

    reply
      .header('Access-Control-Allow-Origin', process.env.WEB_URL ?? 'http://localhost:3000')
      .header('Access-Control-Expose-Headers', 'Content-Disposition')
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="statement-${fileSafeName}.csv"`)
      .send(csv)
  })
}
