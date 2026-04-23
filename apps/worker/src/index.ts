/**
 * Background worker — runs independently of the API server.
 * Handles: payment reminders, daily reports, low-stock alerts.
 */
import cron           from 'node-cron'
import { Queue }      from 'bullmq'
import IORedis        from 'ioredis'
import { prisma }     from '@cement-house/db'
import { daysSince }  from '@cement-house/utils'
import { processReminderJob }  from './processors/reminder'
import { processDailyReport }  from './processors/daily-report'
import { processStockAlert }   from './processors/stock-alert'

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null })
const reminderQueue = new Queue('reminders', { connection: redis })

// ── Schedule: every night at 8 PM ─────────────────────────────────────────────
// Check outstanding dues and queue reminders for overdue customers
cron.schedule('0 20 * * *', async () => {
  console.log('[cron] Checking overdue ledger balances...')

  const customers = await prisma.customer.findMany({ where: { isActive: true } })
  for (const customer of customers) {
    const entries = await prisma.ledgerEntry.findMany({ where: { customerId: customer.id } })
    const balance = entries.reduce((s, e) => s + (e.type === 'DEBIT' ? Number(e.amount) : -Number(e.amount)), 0)
    if (balance <= 0) continue

    const oldest = entries.filter(e => e.type === 'DEBIT').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
    if (!oldest) continue
    const days = daysSince(oldest.createdAt)

    // Queue reminders at 7, 15, 30-day thresholds
    if (days === 7 || days === 15 || days === 30) {
      await reminderQueue.add('send-reminder', { customerId: customer.id, balance, days, phone: customer.phone, name: customer.name })
    }
  }
})

// ── Schedule: every day at 8 PM — daily summary ─────────────────────────────
cron.schedule('30 20 * * *', () => processDailyReport())

// ── Schedule: every 6 hours — low stock check ────────────────────────────────
cron.schedule('0 */6 * * *', () => processStockAlert())

// ── Worker: process queued reminder jobs ──────────────────────────────────────
import { Worker } from 'bullmq'
new Worker('reminders', processReminderJob, { connection: redis })

console.log('Worker started. Cron jobs active.')
