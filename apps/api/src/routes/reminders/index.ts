import type { FastifyInstance } from 'fastify'
import { z }         from 'zod'
import { prisma }    from '@cement-house/db'
import { WA_TEMPLATES } from '@cement-house/utils'
import { requireOwner, getBizId } from '../../middleware/auth'
import { createAuditLog } from '../../services/audit'

const SendReminderSchema = z.object({
  customerId: z.string().uuid(),
  amount:     z.number().positive(),
  days:       z.number().int().positive(),
  channel:    z.enum(['WHATSAPP','SMS']).default('WHATSAPP'),
})

async function sendWhatsAppTemplate(phone: string, templateName: string, params: (string | number)[]) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `91${phone}`,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: params.map(p => ({ type: 'text', text: String(p) }))
            }
          ]
        },
      }),
    }
  )
  return res.ok
}

type LedgerSnapshot = {
  balance: number
  oldestDebitAt: Date | null
}

function buildLedgerSnapshotMap(entries: Array<{ customerId: string; type: string; amount: unknown; createdAt: Date }>) {
  const map = new Map<string, LedgerSnapshot>()
  for (const entry of entries) {
    const current = map.get(entry.customerId) ?? { balance: 0, oldestDebitAt: null }
    const amount = Number(entry.amount ?? 0)
    if (entry.type === 'DEBIT') {
      current.balance += amount
      if (!current.oldestDebitAt || entry.createdAt < current.oldestDebitAt) {
        current.oldestDebitAt = entry.createdAt
      }
    } else {
      current.balance -= amount
    }
    map.set(entry.customerId, current)
  }
  return map
}

export async function reminderRoutes(app: FastifyInstance) {
  // GET /api/reminders  — recent reminders log
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const { customerId } = req.query as any
    const where: any = { customer: { businessId: bizId } }
    if (customerId) where.customerId = customerId
    const reminders = await prisma.reminder.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 50,
      include: { customer: { select: { name: true, phone: true } } },
    })
    return { success: true, data: reminders }
  })

  // POST /api/reminders/send  — manually trigger a reminder (owner only)
  app.post('/send', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = SendReminderSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const customer = await prisma.customer.findUnique({ where: { id: body.data.customerId } })
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })

    const jwtUser = req.user as any
    const bName = jwtUser?.businessName ?? 'Cement House'
    const message = WA_TEMPLATES.paymentReminder(customer.name, body.data.amount, body.data.days, bName)
    
    // {{1}} Name, {{2}} Amount, {{3}} Days, {{4}} Current Date
    const todayStr = new Date().toLocaleDateString('en-GB')
    const params = [customer.name, body.data.amount, body.data.days, todayStr]
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'payment_reminder_template'
    const sent = await sendWhatsAppTemplate(customer.phone, templateName, params)

    const reminder = await prisma.reminder.create({
      data: {
        customerId:  customer.id,
        channel:     body.data.channel,
        status:      sent ? 'SENT' : 'FAILED',
        messageBody: message,
        scheduledAt: new Date(),
        sentAt:      sent ? new Date() : undefined,
      },
    })

    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: bizId,
      action: sent ? 'REMINDER_SENT' : 'REMINDER_FAILED',
      targetType: 'CUSTOMER',
      targetId: customer.id,
      metadata: {
        customerName: customer.name,
        channel: body.data.channel,
        amount: body.data.amount,
        days: body.data.days,
      },
    })

    return { success: true, data: { reminder, sent } }
  })

  // POST /api/reminders/bulk  — send reminders to all overdue customers (owner only)
  app.post('/bulk', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const { minDays = 7 } = req.body as any

    const customers = await prisma.customer.findMany({ where: { isActive: true, businessId: bizId } })
    const customerIds = customers.map((customer) => customer.id)
    const ledgerEntries = customerIds.length > 0
      ? await prisma.ledgerEntry.findMany({
          where: { customerId: { in: customerIds } },
          select: { customerId: true, type: true, amount: true, createdAt: true },
        })
      : []
    const ledgerMap = buildLedgerSnapshotMap(ledgerEntries)
    const results = []

    for (const customer of customers) {
      if (!customer.remindersEnabled) continue
      const snapshot = ledgerMap.get(customer.id)
      const balance = Number(snapshot?.balance ?? 0)
      if (balance <= 0) continue
      const oldest = snapshot?.oldestDebitAt
      if (!oldest) continue

      const days = Math.floor((Date.now() - oldest.getTime()) / 86_400_000)
      if (days < minDays) continue

      // {{1}} Name, {{2}} Amount, {{3}} Days, {{4}} Current Date
      const todayStr = new Date().toLocaleDateString('en-GB')
      const message = WA_TEMPLATES.paymentReminder(customer.name, balance, days, todayStr)

      const params = [customer.name, balance, days, todayStr]
      const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'payment_reminder_template'
      const sent = await sendWhatsAppTemplate(customer.phone, templateName, params)

      await prisma.reminder.create({
        data: {
          customerId: customer.id, channel: 'WHATSAPP',
          status: sent ? 'SENT' : 'FAILED',
          messageBody: message, scheduledAt: new Date(),
          sentAt: sent ? new Date() : undefined,
        },
      })
      await createAuditLog({
        actorId: (req.user as any).id,
        businessId: bizId,
        action: sent ? 'REMINDER_SENT' : 'REMINDER_FAILED',
        targetType: 'CUSTOMER',
        targetId: customer.id,
        metadata: {
          customerName: customer.name,
          channel: 'WHATSAPP',
          amount: balance,
          days,
          source: 'bulk',
        },
      })
      results.push({ customer: customer.name, balance, days, sent })
    }

    return { success: true, data: { sent: results.length, results } }
  })

  // POST /api/reminders/send-selected  — manually trigger bulk reminders (owner only)
  app.post('/send-selected', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const { customerIds } = req.body as any
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return reply.status(400).send({ success: false, error: 'No customers selected' })
    }

    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds }, isActive: true, businessId: bizId }
    })
    const resolvedCustomerIds = customers.map((customer) => customer.id)
    const ledgerEntries = resolvedCustomerIds.length > 0
      ? await prisma.ledgerEntry.findMany({
          where: { customerId: { in: resolvedCustomerIds } },
          select: { customerId: true, type: true, amount: true, createdAt: true },
        })
      : []
    const ledgerMap = buildLedgerSnapshotMap(ledgerEntries)
    
    const results = []

    for (const customer of customers) {
      const snapshot = ledgerMap.get(customer.id)
      const balance = Number(snapshot?.balance ?? 0)
      if (balance <= 0) continue

      const oldest = snapshot?.oldestDebitAt
      const days = oldest ? Math.floor((Date.now() - oldest.getTime()) / 86_400_000) : 0

      // {{1}} Name, {{2}} Amount, {{3}} Days, {{4}} Current Date
      const todayStr = new Date().toLocaleDateString('en-GB')
      const message = WA_TEMPLATES.paymentReminder(customer.name, balance, days, todayStr)

      const params = [customer.name, balance, days, todayStr]
      const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'payment_reminder_template'
      const sent = await sendWhatsAppTemplate(customer.phone, templateName, params)

      await prisma.reminder.create({
        data: {
          customerId: customer.id, channel: 'WHATSAPP',
          status: sent ? 'SENT' : 'FAILED',
          messageBody: message, scheduledAt: new Date(),
          sentAt: sent ? new Date() : undefined,
        },
      })
      await createAuditLog({
        actorId: (req.user as any).id,
        businessId: bizId,
        action: sent ? 'REMINDER_SENT' : 'REMINDER_FAILED',
        targetType: 'CUSTOMER',
        targetId: customer.id,
        metadata: {
          customerName: customer.name,
          channel: 'WHATSAPP',
          amount: balance,
          days,
          source: 'selected',
        },
      })
      results.push({ customer: customer.name, balance, sent })
    }

    return { success: true, data: { sent: results.length, results } }
  })
}
