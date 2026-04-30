/**
 * Background worker — runs independently of the API server.
 * Handles: payment reminders, daily reports, low-stock alerts.
 */
import cron from 'node-cron'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { prisma } from '@cement-house/db'
import { daysSince } from '@cement-house/utils'
import { processReminderJob } from './processors/reminder'
import { processDailyReport } from './processors/daily-report'
import { processStockAlert } from './processors/stock-alert'

console.log("process.env.REDIS_URL", process.env.REDIS_URL);
const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: process.env.REDIS_URL?.startsWith('rediss://')
    ? { rejectUnauthorized: false }
    : undefined,
})
const reminderQueue = new Queue('reminders', { connection: redis })

// ── Schedule: every night at 8 PM ─────────────────────────────────────────────
// Check outstanding dues and queue reminders for overdue customers
cron.schedule('0 20 * * *', async () => {
  console.log('[cron] Checking overdue ledger balances...')

  const customers = await prisma.customer.findMany({ where: { isActive: true } })
  const customerIds = customers.map((customer) => customer.id)
  const entries = customerIds.length > 0
    ? await prisma.ledgerEntry.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, type: true, amount: true, createdAt: true },
    })
    : []
  const ledgerMap = new Map<string, { balance: number; oldestDebitAt: Date | null }>()
  for (const entry of entries) {
    const current = ledgerMap.get(entry.customerId) ?? { balance: 0, oldestDebitAt: null }
    const amount = Number(entry.amount ?? 0)
    if (entry.type === 'DEBIT') {
      current.balance += amount
      if (!current.oldestDebitAt || entry.createdAt < current.oldestDebitAt) current.oldestDebitAt = entry.createdAt
    } else {
      current.balance -= amount
    }
    ledgerMap.set(entry.customerId, current)
  }

  for (const customer of customers) {
    const snapshot = ledgerMap.get(customer.id)
    const balance = Number(snapshot?.balance ?? 0)
    if (balance <= 0) continue

    const oldest = snapshot?.oldestDebitAt
    if (!oldest) continue
    const days = daysSince(oldest)

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

// ── Health-check HTTP server (so Render free tier can run this as a Web Service)
import { createServer } from 'node:http'
const healthPort = Number(process.env.WORKER_PORT ?? 10000)
createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', service: 'worker', ts: new Date().toISOString() }))
}).listen(healthPort, '0.0.0.0', () => {
  console.log(`Worker health-check on port ${healthPort}`)
})

console.log('Worker started. Cron jobs active.')

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`)
  await reminderQueue.close()
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))