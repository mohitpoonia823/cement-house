/**
 * Background worker — runs independently of the API server.
 * Handles: payment reminders, daily reports, low-stock alerts.
 */
import cron from 'node-cron'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { remindersRepository } from '@cement-house/db'
import { daysSince } from '@cement-house/utils'
import { processReminderJob } from './processors/reminder'
import { processDailyReport } from './processors/daily-report'
import { processStockAlert } from './processors/stock-alert'
import {
  enqueueSubscriptionNotices,
  processSubscriptionLifecycle,
  processSubscriptionNoticeJob,
} from './processors/subscription-lifecycle'

console.log("process.env.REDIS_URL", process.env.REDIS_URL);
const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: process.env.REDIS_URL?.startsWith('rediss://')
    ? { rejectUnauthorized: false }
    : undefined,
})
const reminderQueue = new Queue('reminders', { connection: redis })
const subscriptionNoticeQueue = new Queue('subscription-notices', { connection: redis })

// ── Schedule: every night at 8 PM ─────────────────────────────────────────────
// Check outstanding dues and queue reminders for overdue customers
cron.schedule('0 20 * * *', async () => {
  console.log('[cron] Checking overdue ledger balances...')

  // Balances + oldest open debit are computed in SQL; only customers with a
  // positive balance (and reminders enabled) come back, so we never pull the
  // whole ledger into memory.
  const overdue = await remindersRepository.getGlobalOverdueCustomers()
  const lastSentRows = await remindersRepository.getLastSentReminderByCustomerIds(
    overdue.map((c) => c.customerId)
  )
  const lastSent = new Map(lastSentRows.map((r) => [r.customerId, new Date(r.lastSentAt)]))

  for (const customer of overdue) {
    const oldest = customer.oldestDebitAt
    if (!oldest) continue
    const days = daysSince(new Date(oldest))

    // Bucketed thresholds with catch-up: 7 and 15 days, then every 30 days.
    // Unlike a strict `days === threshold` check, a customer whose threshold
    // night was missed (worker asleep/redeploying) is still picked up the next
    // night — the sent-history check below prevents double-sends.
    let bucket = 0
    if (days >= 30) bucket = 30 * Math.floor(days / 30)
    else if (days >= 15) bucket = 15
    else if (days >= 7) bucket = 7
    if (bucket === 0) continue

    // Skip if a reminder already went out since this bucket was crossed.
    const crossedAt = new Date(Date.now() - (days - bucket) * 24 * 60 * 60 * 1000)
    const prev = lastSent.get(customer.customerId)
    if (prev && prev >= crossedAt) continue

    // Deterministic jobId → BullMQ dedupes if the cron re-fires or the worker
    // restarts mid-run, preventing duplicate WhatsApp messages to a customer.
    const dayKey = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    await reminderQueue.add(
      'send-reminder',
      { customerId: customer.customerId, balance: customer.balance, days, phone: customer.phone, name: customer.name },
      {
        jobId: `reminder:${customer.customerId}:${bucket}:${dayKey}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      }
    )
  }
})

// ── Schedule: every day at 8 PM — daily summary ─────────────────────────────
cron.schedule('30 20 * * *', () => processDailyReport())

// ── Schedule: every 6 hours — low stock check ────────────────────────────────
cron.schedule('0 */6 * * *', () => processStockAlert())

// ── Schedule: hourly — subscription lifecycle sweep ──────────────────────────
// Activates queued paid-ahead windows and moves lapsed trials/subscriptions to
// PAST_DUE, so state transitions no longer depend on the owner logging in.
cron.schedule('15 * * * *', () =>
  processSubscriptionLifecycle().catch((error) => console.error('[billing] lifecycle sweep failed:', error)),
)

// ── Schedule: daily at 10 AM — renewal reminders (T-7/3/1) + past-due dunning ─
cron.schedule('0 10 * * *', () =>
  enqueueSubscriptionNotices(subscriptionNoticeQueue).catch((error) =>
    console.error('[billing] notice scheduling failed:', error),
  ),
)

// ── Worker: process queued reminder jobs ──────────────────────────────────────
// concurrency drains the queue faster; removeOn* bounds Redis growth — important
// because this instance is shared with the app cache and must stay `noeviction`.
import { Worker } from 'bullmq'
new Worker('reminders', processReminderJob, {
  connection: redis,
  concurrency: 5,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
})
new Worker('subscription-notices', processSubscriptionNoticeJob, {
  connection: redis,
  concurrency: 3,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
})

// ── Health-check HTTP server (so Render free tier can run this as a Web Service)
import { createServer } from 'node:http'
const healthPort = Number(process.env.PORT ?? 10000)
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
  await subscriptionNoticeQueue.close()
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))