import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { remindersRepository } from '@cement-house/db'
import { WA_TEMPLATES } from '@cement-house/utils'
import { requireOwner, getBizId } from '../../middleware/auth'
import { createAuditLog } from '../../services/audit'

const SendReminderSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  days: z.number().int().positive(),
  channel: z.enum(['WHATSAPP', 'SMS']).default('WHATSAPP'),
})

const BulkSchema = z.object({
  minDays: z.number().int().positive().default(7).optional(),
})

const SendSelectedSchema = z.object({
  customerIds: z.array(z.string().uuid()).min(1),
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
              parameters: params.map((p) => ({ type: 'text', text: String(p) })),
            },
          ],
        },
      }),
    }
  )
  return res.ok
}

export async function reminderRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const { customerId } = req.query as { customerId?: string }
    const reminders = await remindersRepository.listRecentReminders(bizId, customerId)
    return { success: true, data: reminders }
  })

  app.post('/send', async (req, reply) => {
    if (!requireOwner(req, reply)) return

    const bizId = getBizId(req)
    const body = SendReminderSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const customer = await remindersRepository.getCustomerByIdInBusiness(body.data.customerId, bizId)
    if (!customer) return reply.status(404).send({ success: false, error: 'Customer not found' })

    const jwtUser = req.user as any
    const businessName = jwtUser?.businessName ?? 'Business Hub'
    const message = WA_TEMPLATES.paymentReminder(customer.name, body.data.amount, body.data.days, businessName)

    const todayStr = new Date().toLocaleDateString('en-GB')
    const params = [customer.name, body.data.amount, body.data.days, todayStr]
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'payment_reminder_template'
    const sent = await sendWhatsAppTemplate(customer.phone, templateName, params)

    const reminder = await remindersRepository.createReminder({
      customerId: customer.id,
      channel: body.data.channel,
      status: sent ? 'SENT' : 'FAILED',
      messageBody: message,
      scheduledAt: new Date(),
      sentAt: sent ? new Date() : undefined,
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

  app.post('/bulk', async (req, reply) => {
    if (!requireOwner(req, reply)) return

    const bizId = getBizId(req)
    const parsed = BulkSchema.safeParse(req.body ?? {})
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.message })
    const minDays = parsed.data.minDays ?? 7

    const customers = await remindersRepository.listCustomersByBusiness(bizId)
    const snapshots = await remindersRepository.getLedgerSnapshotsByCustomerIds(
      bizId,
      customers.map((customer) => customer.id)
    )
    const snapshotMap = new Map(snapshots.map((entry) => [entry.customerId, entry]))

    const results: Array<{ customer: string; balance: number; days: number; sent: boolean }> = []

    for (const customer of customers) {
      if (!customer.remindersEnabled) continue
      const snapshot = snapshotMap.get(customer.id)
      const balance = Number(snapshot?.balance ?? 0)
      if (balance <= 0) continue

      const oldest = snapshot?.oldestDebitAt
      if (!oldest) continue
      const days = Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000)
      if (days < minDays) continue

      const todayStr = new Date().toLocaleDateString('en-GB')
      const message = WA_TEMPLATES.paymentReminder(customer.name, balance, days, todayStr)

      const params = [customer.name, balance, days, todayStr]
      const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'payment_reminder_template'
      const sent = await sendWhatsAppTemplate(customer.phone, templateName, params)

      await remindersRepository.createReminder({
        customerId: customer.id,
        channel: 'WHATSAPP',
        status: sent ? 'SENT' : 'FAILED',
        messageBody: message,
        scheduledAt: new Date(),
        sentAt: sent ? new Date() : undefined,
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

  app.post('/send-selected', async (req, reply) => {
    if (!requireOwner(req, reply)) return

    const bizId = getBizId(req)
    const parsed = SendSelectedSchema.safeParse(req.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.message })

    const customers = await remindersRepository.listCustomersByBusiness(bizId, parsed.data.customerIds)
    const snapshots = await remindersRepository.getLedgerSnapshotsByCustomerIds(
      bizId,
      customers.map((customer) => customer.id)
    )
    const snapshotMap = new Map(snapshots.map((entry) => [entry.customerId, entry]))

    const results: Array<{ customer: string; balance: number; sent: boolean }> = []

    for (const customer of customers) {
      const snapshot = snapshotMap.get(customer.id)
      const balance = Number(snapshot?.balance ?? 0)
      if (balance <= 0) continue

      const oldest = snapshot?.oldestDebitAt
      const days = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000) : 0

      const todayStr = new Date().toLocaleDateString('en-GB')
      const message = WA_TEMPLATES.paymentReminder(customer.name, balance, days, todayStr)

      const params = [customer.name, balance, days, todayStr]
      const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'payment_reminder_template'
      const sent = await sendWhatsAppTemplate(customer.phone, templateName, params)

      await remindersRepository.createReminder({
        customerId: customer.id,
        channel: 'WHATSAPP',
        status: sent ? 'SENT' : 'FAILED',
        messageBody: message,
        scheduledAt: new Date(),
        sentAt: sent ? new Date() : undefined,
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
