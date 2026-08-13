/**
 * Scheduled jobs, exposed over HTTP.
 *
 * These replace the node-cron schedules that ran inside apps/worker. A
 * serverless deployment has no always-on process to hold a clock, so the
 * schedule now lives with an external trigger (Vercel Cron or Upstash QStash)
 * that calls these endpoints.
 *
 * Both GET and POST are accepted: Vercel Cron issues GET, QStash issues POST.
 *
 * Auth is a shared secret, not JWT — there is no user behind these calls. The
 * plugin refuses to serve anything if CRON_SECRET is unset, so a misconfigured
 * deploy fails closed rather than exposing the jobs to the internet.
 */
import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { runPaymentReminders } from '../../jobs/payment-reminders'
import { runDailyReport } from '../../jobs/daily-report'
import { runStockAlert } from '../../jobs/stock-alert'
import { runSubscriptionLifecycle, runSubscriptionNotices } from '../../jobs/subscription-lifecycle'

function secretsMatch(provided: string, expected: string) {
  const providedBuf = Buffer.from(provided, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}

function authorizeCron(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    req.log.error('CRON_SECRET is not configured — refusing to run scheduled job')
    return reply.status(503).send({ success: false, error: 'Cron is not configured' })
  }

  const header = String(req.headers.authorization ?? '')
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const provided = bearer || String(req.headers['x-cron-secret'] ?? '').trim()
  if (!provided || !secretsMatch(provided, expected)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' })
  }
  return undefined
}

const JOBS = {
  'payment-reminders': runPaymentReminders,
  'daily-report': runDailyReport,
  'stock-alert': runStockAlert,
  'subscription-lifecycle': runSubscriptionLifecycle,
  'subscription-notices': runSubscriptionNotices,
} as const

export async function cronRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authorizeCron)

  for (const [name, run] of Object.entries(JOBS)) {
    // Errors propagate to the app-level handler, which returns 500 — that is
    // what tells the scheduler to retry.
    const handler = async () => {
      const startedAt = Date.now()
      const result = await run()
      return { success: true, job: name, ms: Date.now() - startedAt, result }
    }
    app.get(`/${name}`, handler)
    app.post(`/${name}`, handler)
  }
}
