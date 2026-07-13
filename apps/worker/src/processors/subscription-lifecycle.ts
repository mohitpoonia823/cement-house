import type { Job, Queue } from 'bullmq'
import { prisma, subscriptionsRepository } from '@cement-house/db'
import { WA_TEMPLATES } from '@cement-house/utils'

/**
 * Hourly sweep: drive subscription state transitions for every lapsed business
 * instead of waiting for its owner to log in (previously the only trigger).
 *
 * getCurrentSubscriptionByBusiness() is intentionally reused per business — it
 * activates queued paid-ahead windows (extending the end date) and expires
 * stale subscription rows, so a tenant who paid in advance is never locked.
 * Only businesses still lapsed after that get moved to PAST_DUE.
 */
export async function processSubscriptionLifecycle() {
  const now = new Date()
  const lapsed = await subscriptionsRepository.findBusinessesWithLapsedSubscriptions(now)
  if (lapsed.length === 0) return

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
          metadata: { source: 'worker', transitionedAt: now.toISOString() },
        },
      })
      .catch(() => undefined)
  }
  console.log(`[billing] lifecycle sweep: ${lapsed.length} lapsed checked, ${transitioned.length} moved to PAST_DUE`)
}

type NoticeJobData = {
  kind: 'RENEWAL' | 'DUNNING'
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

// Bucketed with catch-up (same pattern as customer payment reminders): a
// missed cron night is picked up at the next lower bucket; the deterministic
// jobId (businessId + bucket + end date) prevents duplicate sends.
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

/** Daily: queue renewal reminders (T-7/T-3/T-1) and past-due dunning (D+1/D+3/D+7). */
export async function enqueueSubscriptionNotices(queue: Queue) {
  const now = new Date()

  const upcoming = await subscriptionsRepository.getUpcomingRenewalBusinesses(now)
  for (const business of upcoming) {
    if (!business.ownerPhone || !business.subscriptionEndsAt) continue
    const daysLeft = daysBetween(now, new Date(business.subscriptionEndsAt))
    const bucket = renewalBucket(daysLeft)
    if (bucket === null) continue
    const endKey = new Date(business.subscriptionEndsAt).toISOString().slice(0, 10)
    await queue.add(
      'subscription-notice',
      {
        kind: 'RENEWAL',
        businessId: business.id,
        businessName: business.name,
        ownerName: business.ownerName ?? 'Owner',
        ownerPhone: business.ownerPhone,
        days: Math.max(1, daysLeft),
        endsAtIso: new Date(business.subscriptionEndsAt).toISOString(),
        isTrial: business.subscriptionStatus === 'TRIAL' || !business.subscriptionInterval,
      } satisfies NoticeJobData,
      {
        jobId: `subrem:${business.id}:${bucket}:${endKey}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    )
  }

  const pastDue = await subscriptionsRepository.getRecentlyPastDueBusinesses(now)
  for (const business of pastDue) {
    if (!business.ownerPhone || !business.subscriptionEndsAt) continue
    const daysOverdue = Math.max(0, -daysBetween(now, new Date(business.subscriptionEndsAt)))
    const bucket = dunningBucket(daysOverdue)
    if (bucket === null) continue
    const endKey = new Date(business.subscriptionEndsAt).toISOString().slice(0, 10)
    await queue.add(
      'subscription-notice',
      {
        kind: 'DUNNING',
        businessId: business.id,
        businessName: business.name,
        ownerName: business.ownerName ?? 'Owner',
        ownerPhone: business.ownerPhone,
        days: Math.max(1, daysOverdue),
        endsAtIso: new Date(business.subscriptionEndsAt).toISOString(),
        isTrial: false,
      } satisfies NoticeJobData,
      {
        jobId: `subdun:${business.id}:${bucket}:${endKey}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    )
  }

  console.log(`[billing] notices queued: ${upcoming.length} upcoming renewals scanned, ${pastDue.length} past-due scanned`)
}

/** BullMQ processor: send one renewal/dunning WhatsApp to the owner and audit it. */
export async function processSubscriptionNoticeJob(job: Job) {
  const data = job.data as NoticeJobData
  const endDateStr = new Date(data.endsAtIso).toLocaleDateString('en-IN')
  const message =
    data.kind === 'RENEWAL'
      ? WA_TEMPLATES.subscriptionRenewalReminder(data.ownerName, data.businessName, data.days, endDateStr, data.isTrial)
      : WA_TEMPLATES.subscriptionExpired(data.ownerName, data.businessName, data.days)

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
        to: `91${data.ownerPhone}`,
        type: 'text',
        text: { body: message },
      }),
    },
  )

  await prisma.auditLog
    .create({
      data: {
        businessId: data.businessId,
        action: data.kind === 'RENEWAL' ? 'SUBSCRIPTION_REMINDER_SENT' : 'SUBSCRIPTION_DUNNING_SENT',
        targetType: 'BUSINESS',
        targetId: data.businessId,
        metadata: {
          channel: 'WHATSAPP',
          status: res.ok ? 'SENT' : 'FAILED',
          days: data.days,
          endsAt: data.endsAtIso,
        },
      },
    })
    .catch(() => undefined)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`WhatsApp send failed (${res.status}) for ${data.businessName}: ${body.slice(0, 200)}`)
  }
  console.log(`[billing] ${data.kind} notice sent → ${data.businessName} (${data.ownerPhone}), ${data.days}d`)
}
