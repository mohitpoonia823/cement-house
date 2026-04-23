import type { FastifyInstance } from 'fastify'
import { z }         from 'zod'
import { prisma }    from '@cement-house/db'
import { getBizId }  from '../../middleware/auth'

const RecordPaymentSchema = z.object({
  customerId:  z.string().uuid(),
  amount:      z.number().positive(),
  paymentMode: z.enum(['CASH','UPI','CHEQUE','CREDIT','PARTIAL']),
  reference:   z.string().optional(),   // UPI txn ID, cheque number
  notes:       z.string().optional(),
  orderId:     z.string().uuid().optional(),
})

export async function ledgerRoutes(app: FastifyInstance) {
  // GET /api/ledger/:customerId — full ledger for one customer
  app.get('/:customerId', async (req) => {
    const { customerId } = req.params as any
    const entries = await prisma.ledgerEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      include: { order: { select: { orderNumber: true } } },
    })

    // Compute running balance
    let balance = 0
    const withBalance = entries.map(e => {
      balance += e.type === 'DEBIT' ? Number(e.amount) : -Number(e.amount)
      return { ...e, runningBalance: balance }
    })

    return { success: true, data: { entries: withBalance, currentBalance: balance } }
  })

  // GET /api/ledger/summary/all — all customers with outstanding balance (scoped to business)
  app.get('/summary/all', async (req) => {
    const bizId = getBizId(req)
    const customers = await prisma.customer.findMany({ where: { isActive: true, businessId: bizId } })
    const summaries = await Promise.all(customers.map(async (c) => {
      const agg = await prisma.ledgerEntry.groupBy({
        by: ['type'], where: { customerId: c.id },
        _sum: { amount: true },
      })
      const debit  = agg.find(a => a.type === 'DEBIT')?._sum.amount  ?? 0
      const credit = agg.find(a => a.type === 'CREDIT')?._sum.amount ?? 0
      const balance = Number(debit) - Number(credit)
      return { customerId: c.id, customerName: c.name, phone: c.phone, balance, riskTag: c.riskTag }
    }))
    return { success: true, data: summaries.filter(s => s.balance !== 0) }
  })

  // POST /api/ledger/payment — record a payment
  app.post('/payment', async (req, reply) => {
    const user = req.user as { id: string }
    const bizId = getBizId(req)
    const body = RecordPaymentSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const entry = await prisma.$transaction(async (tx) => {
      const ledger = await tx.ledgerEntry.create({
        data: {
          customerId:  body.data.customerId,
          orderId:     body.data.orderId,
          type:        'CREDIT',
          amount:      body.data.amount,
          paymentMode: body.data.paymentMode,
          reference:   body.data.reference,
          notes:       body.data.notes,
          recordedById: user.id,
          businessId:  bizId,
        },
      })

      // Keep order.amountPaid in sync with ledger credits
      if (body.data.orderId) {
        await tx.order.update({
          where: { id: body.data.orderId },
          data:  { amountPaid: { increment: body.data.amount } },
        })
      } else {
        // General payment — distribute to oldest unpaid orders (FIFO)
        const unpaidOrders = await tx.order.findMany({
          where: {
            customerId: body.data.customerId,
            status:     { not: 'CANCELLED' },
          },
          orderBy: { createdAt: 'asc' },
        })

        let remaining = body.data.amount
        for (const order of unpaidOrders) {
          if (remaining <= 0) break
          const due = Number(order.totalAmount) - Number(order.amountPaid)
          if (due <= 0) continue
          const applied = Math.min(remaining, due)
          await tx.order.update({
            where: { id: order.id },
            data:  { amountPaid: { increment: applied } },
          })
          remaining -= applied
        }
      }

      return ledger
    })
    return { success: true, data: entry }
  })
}

// GET /api/ledger/:customerId/statement  — stream PDF statement
import { streamStatement } from '../../services/pdf'

export async function ledgerStatementRoute(app: FastifyInstance) {
  app.get('/:customerId/statement', async (req, reply) => {
    const { customerId } = req.params as any
    const customer = await prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })

    const entries = await prisma.ledgerEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      include: { order: { select: { orderNumber: true } } },
    })

    let balance = 0
    const rows = entries.map(e => {
      const amt = Number(e.amount)
      balance += e.type === 'DEBIT' ? amt : -amt
      return {
        date:        e.createdAt,
        description: e.notes ?? (e.order ? `Order ${e.order.orderNumber}` : e.type),
        debit:       e.type === 'DEBIT'  ? amt : null,
        credit:      e.type === 'CREDIT' ? amt : null,
        balance,
      }
    })

    const jwtUser = req.user as any

    streamStatement({
      customerName:   customer.name,
      customerPhone:  customer.phone,
      generatedAt:    new Date(),
      currentBalance: balance,
      businessName:   jwtUser.businessName ?? 'Cement House',
      businessCity:   jwtUser.businessCity ?? '',
      entries:        rows,
    }, reply)
  })
}
