/**
 * Nightly payment reminders — ported from apps/worker.
 *
 * The worker split this in two: a cron that enqueued BullMQ jobs and a Worker
 * that sent them. Redis is gone, so the scan and the send happen in one pass.
 * Idempotency never depended on Redis anyway — it comes from the reminders
 * table (see the sent-history check below), which is what makes this safe to
 * collapse.
 */
import { remindersRepository } from '@cement-house/db'
import { daysSince, WA_TEMPLATES } from '@cement-house/utils'
import { sendWhatsAppText } from './whatsapp'
import { mapWithConcurrency } from './concurrency'

/**
 * Bucketed thresholds with catch-up: 7 and 15 days, then every 30 days.
 * Unlike a strict `days === threshold` check, a customer whose threshold night
 * was missed (cron failed, deploy in flight) is still picked up the next night
 * — the sent-history check prevents the double-send.
 */
function overdueBucket(days: number): number {
  if (days >= 30) return 30 * Math.floor(days / 30)
  if (days >= 15) return 15
  if (days >= 7) return 7
  return 0
}

export async function runPaymentReminders() {
  // Balances + oldest open debit are computed in SQL; only customers with a
  // positive balance (and reminders enabled) come back, so we never pull the
  // whole ledger into memory.
  const overdue = await remindersRepository.getGlobalOverdueCustomers()
  if (overdue.length === 0) return { scanned: 0, sent: 0, failed: 0, skipped: 0 }

  const lastSentRows = await remindersRepository.getLastSentReminderByCustomerIds(
    overdue.map((customer) => customer.customerId),
  )
  const lastSent = new Map(lastSentRows.map((row) => [row.customerId, new Date(row.lastSentAt)]))

  const due = overdue.filter((customer) => {
    if (!customer.oldestDebitAt || !customer.phone) return false
    const days = daysSince(new Date(customer.oldestDebitAt))
    const bucket = overdueBucket(days)
    if (bucket === 0) return false

    // Skip if a reminder already went out since this bucket was crossed.
    const crossedAt = new Date(Date.now() - (days - bucket) * 24 * 60 * 60 * 1000)
    const previous = lastSent.get(customer.customerId)
    return !(previous && previous >= crossedAt)
  })

  const outcomes = await mapWithConcurrency(due, 5, async (customer) => {
    const days = daysSince(new Date(customer.oldestDebitAt!))
    const message = WA_TEMPLATES.paymentReminder(
      customer.name,
      customer.balance,
      days,
      new Date().toLocaleDateString('en-IN'),
    )

    const result = await sendWhatsAppText(customer.phone, message)
    const now = new Date()
    await remindersRepository.createReminder({
      customerId: customer.customerId,
      channel: 'WHATSAPP',
      status: result.ok ? 'SENT' : 'FAILED',
      messageBody: message,
      scheduledAt: now,
      sentAt: result.ok ? now : undefined,
    })

    if (!result.ok) {
      console.error(`[reminder] FAILED → ${customer.name} (${customer.phone}): ${result.error ?? result.status}`)
    }
    return result.ok
  })

  const sent = outcomes.filter(Boolean).length
  const summary = { scanned: overdue.length, sent, failed: outcomes.length - sent, skipped: overdue.length - due.length }
  console.log(`[reminder] ${JSON.stringify(summary)}`)
  return summary
}
