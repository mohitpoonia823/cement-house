import type { Job }  from 'bullmq'
import { prisma }    from '@cement-house/db'
import { WA_TEMPLATES } from '@cement-house/utils'

export async function processReminderJob(job: Job) {
  const { customerId, balance, days, phone, name } = job.data

  const message = WA_TEMPLATES.paymentReminder(name, balance, days, new Date().toLocaleDateString('en-IN'))

  // Send via WhatsApp Cloud API
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
        type: 'text',
        text: { body: message },
      }),
    }
  )

  const status = res.ok ? 'SENT' : 'FAILED'

  // Record in reminders table
  await prisma.reminder.create({
    data: {
      customerId,
      channel:     'WHATSAPP',
      status,
      messageBody: message,
      scheduledAt: new Date(),
      sentAt:      res.ok ? new Date() : undefined,
    },
  })

  console.log(`[reminder] ${status} → ${name} (${phone}) | ₹${balance} | ${days}d overdue`)
}
