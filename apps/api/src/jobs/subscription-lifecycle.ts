/**
 * Subscription lifecycle + renewal/dunning notices — ported from apps/worker.
 *
 * The worker deduped notices with a deterministic BullMQ jobId in Redis. With
 * Redis gone the same guarantee comes from the audit log: every successful send
 * writes a `dedupeKey` into AuditLog.metadata, and a run skips any key already
 * recorded. That is strictly more durable than the old Redis-backed check —
 * jobIds expired with `removeOnComplete`, audit rows do not.
 */
import { prisma, subscriptionsRepository } from '@cement-house/db'
import { WA_TEMPLATES } from '@cement-house/utils'
import { sendWhatsAppText } from './whatsapp'
import { mapWithConcurrency } from './concurrency'

const RENEWAL_ACTION = 'SUBSCRIPTION_REMINDER_SENT'
const DUNNING_ACTION = 'SUBSCRIPTION_DUNNING_SENT'

/** How far back to read audit history when rebuilding the sent-notice set. */
const DEDUPE_WINDOW_DAYS = 90

/**
 * Hourly sweep: drive subscription state transitions for every lapsed business
 * instead of waiting for its owner to log in (previously the only trigger).
 *
 * getCurrentSubscriptionByBusiness() is intentionally reused per business — it
 * activates queued paid-ahead windows (extending the end date) and expires
 * stale subscription rows, so a tenant who paid in advance is never locked.
 * Only businesses still lapsed after that get moved to PAST_DUE.
 */
export async function runSubscriptionLifecycle() {
  const now = new Date()
  const lapsed = await subscriptionsRepository.findBusinessesWithLapsedSubscriptions(now)
  if (lapsed.length === 0) return { lapsed: 0, pastDue: 0 }

  for (const business of lapsed) {
    try {
      await subscriptionsRepository.getCurrentSubscriptionByBusiness(business.id)
    } catch (error) {
      console.error(`[billing] queued-activation check failed for ${business.name}:`, error)
    }
  }

  const transitioned = await subscriptionsRepository.markBusinessesPastDue(
    lapsed.map((business) => business.id),
    now,
  )
  for (const business of transitioned) {
    await prisma.auditLog
      .create({
        data: {
          businessId: business.id,
          action: 'SUBSCRIPTION_EXPIRED',
          targetType: 'BUSINESS',
          targetId: business.id,
          metadata: { source: 'cron', transitionedAt: now.toISOString() },
        },
      })
      .catch(() => undefined)
  }

  const stats = { lapsed: lapsed.length, pastDue: transitioned.length }
  console.log(`[billing] lifecycle sweep: ${JSON.stringify(stats)}`)
  return stats
}

type PendingNotice = {
  kind: 'RENEWAL' | 'DUNNING'
  dedupeKey: string
  businessId: string
  businessName: string
  ownerName: string
  ownerPhone: string
  days: number
  endsAtIso: string
  isTrial: boolean
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000)
}

// Bucketed with catch-up (same pattern as customer payment reminders): a missed
// cron run is picked up at the next lower bucket, and the dedupe key
// (businessId + bucket + end date) prevents duplicate sends.
function renewalBucket(daysLeft: number): number | null {
  if (daysLeft <= 1) return 1
  if (daysLeft <= 3) return 3
  if (daysLeft <= 7) return 7
  return null
}

function dunningBucket(daysOverdue: number): number | null {
  if (daysOverdue >= 7) return 7
  if (daysOverdue >= 3) return 3
  if (daysOverdue >= 1) return 1
  return null
}

/**
 * Keys of notices already delivered. Only SENT rows count — a FAILED attempt
 * must stay eligible so the next run retries it (BullMQ's `attempts: 3` used to
 * cover this).
 */
async function loadSentNoticeKeys(now: Date) {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: { in: [RENEWAL_ACTION, DUNNING_ACTION] },
      createdAt: { gte: new Date(now.getTime() - DEDUPE_WINDOW_DAYS * 86_400_000) },
    },
    select: { metadata: true },
  })

  const keys = new Set<string>()
  for (const row of rows) {
    const metadata = row.metadata as { dedupeKey?: unknown; status?: unknown } | null
    if (!metadata || metadata.status !== 'SENT') continue
    if (typeof metadata.dedupeKey === 'string') keys.add(metadata.dedupeKey)
  }
  return keys
}

/** Daily: renewal reminders (T-7/T-3/T-1) and past-due dunning (D+1/D+3/D+7). */
export async function runSubscriptionNotices() {
  const now = new Date()
  const alreadySent = await loadSentNoticeKeys(now)
  const pending: PendingNotice[] = []

  const upcoming = await subscriptionsRepository.getUpcomingRenewalBusinesses(now)
  for (const business of upcoming) {
    if (!business.ownerPhone || !business.subscriptionEndsAt) continue
    const endsAt = new Date(business.subscriptionEndsAt)
    const daysLeft = daysBetween(now, endsAt)
    const bucket = renewalBucket(daysLeft)
    if (bucket === null) continue
    const dedupeKey = `subrem:${business.id}:${bucket}:${endsAt.toISOString().slice(0, 10)}`
    if (alreadySent.has(dedupeKey)) continue
    pending.push({
      kind: 'RENEWAL',
      dedupeKey,
      businessId: business.id,
      businessName: business.name,
      ownerName: business.ownerName ?? 'Owner',
      ownerPhone: business.ownerPhone,
      days: Math.max(1, daysLeft),
      endsAtIso: endsAt.toISOString(),
      isTrial: business.subscriptionStatus === 'TRIAL' || !business.subscriptionInterval,
    })
  }

  const pastDue = await subscriptionsRepository.getRecentlyPastDueBusinesses(now)
  for (const business of pastDue) {
    if (!business.ownerPhone || !business.subscriptionEndsAt) continue
    const endsAt = new Date(business.subscriptionEndsAt)
    const daysOverdue = Math.max(0, -daysBetween(now, endsAt))
    const bucket = dunningBucket(daysOverdue)
    if (bucket === null) continue
    const dedupeKey = `subdun:${business.id}:${bucket}:${endsAt.toISOString().slice(0, 10)}`
    if (alreadySent.has(dedupeKey)) continue
    pending.push({
      kind: 'DUNNING',
      dedupeKey,
      businessId: business.id,
      businessName: business.name,
      ownerName: business.ownerName ?? 'Owner',
      ownerPhone: business.ownerPhone,
      days: Math.max(1, daysOverdue),
      endsAtIso: endsAt.toISOString(),
      isTrial: false,
    })
  }

  const outcomes = await mapWithConcurrency(pending, 3, (notice) => sendSubscriptionNotice(notice))
  const sent = outcomes.filter(Boolean).length
  const stats = {
    upcomingScanned: upcoming.length,
    pastDueScanned: pastDue.length,
    sent,
    failed: outcomes.length - sent,
  }
  console.log(`[billing] notices: ${JSON.stringify(stats)}`)
  return stats
}

async function sendSubscriptionNotice(notice: PendingNotice) {
  const endDateStr = new Date(notice.endsAtIso).toLocaleDateString('en-IN')
  const message =
    notice.kind === 'RENEWAL'
      ? WA_TEMPLATES.subscriptionRenewalReminder(
          notice.ownerName,
          notice.businessName,
          notice.days,
          endDateStr,
          notice.isTrial,
        )
      : WA_TEMPLATES.subscriptionExpired(notice.ownerName, notice.businessName, notice.days)

  const result = await sendWhatsAppText(notice.ownerPhone, message)

  await prisma.auditLog
    .create({
      data: {
        businessId: notice.businessId,
        action: notice.kind === 'RENEWAL' ? RENEWAL_ACTION : DUNNING_ACTION,
        targetType: 'BUSINESS',
        targetId: notice.businessId,
        metadata: {
          channel: 'WHATSAPP',
          status: result.ok ? 'SENT' : 'FAILED',
          dedupeKey: notice.dedupeKey,
          days: notice.days,
          endsAt: notice.endsAtIso,
        },
      },
    })
    .catch(() => undefined)

  if (!result.ok) {
    console.error(
      `[billing] ${notice.kind} notice failed → ${notice.businessName}: ${result.error ?? result.status}`,
    )
    return false
  }
  console.log(`[billing] ${notice.kind} notice sent → ${notice.businessName}, ${notice.days}d`)
  return true
}
