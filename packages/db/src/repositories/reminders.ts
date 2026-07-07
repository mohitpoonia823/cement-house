import { Prisma } from '@prisma/client'
import { prisma } from '../client'

export interface ReminderWithCustomerRow {
  id: string
  customerId: string
  channel: 'WHATSAPP' | 'SMS'
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  messageBody: string
  scheduledAt: Date
  sentAt: Date | null
  createdAt: Date
  customer: {
    name: string
    phone: string
  }
}

export interface ReminderCustomerRow {
  id: string
  name: string
  phone: string
  remindersEnabled: boolean
}

export interface ReminderLedgerSnapshotRow {
  customerId: string
  balance: number
  oldestDebitAt: Date | null
}

export interface CreatedReminderRow {
  id: string
  customerId: string
  channel: 'WHATSAPP' | 'SMS'
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  messageBody: string
  scheduledAt: Date
  sentAt: Date | null
  createdAt: Date
}

export async function listRecentReminders(businessId: string, customerId?: string) {
  const filters: Prisma.Sql[] = [Prisma.sql`c."businessId" = ${businessId}`]
  if (customerId) filters.push(Prisma.sql`r."customerId" = ${customerId}`)

  return prisma.$queryRaw<ReminderWithCustomerRow[]>(Prisma.sql`
    SELECT
      r.id,
      r."customerId" AS "customerId",
      r.channel::text AS channel,
      r.status::text AS status,
      r."messageBody" AS "messageBody",
      r."scheduledAt" AS "scheduledAt",
      r."sentAt" AS "sentAt",
      r."createdAt" AS "createdAt",
      json_build_object(
        'name', c.name,
        'phone', c.phone
      ) AS customer
    FROM reminders r
    INNER JOIN customers c ON c.id = r."customerId"
    WHERE ${Prisma.join(filters, ' AND ')}
    ORDER BY r."createdAt" DESC
    LIMIT 50
  `)
}

export async function getCustomerByIdInBusiness(customerId: string, businessId: string) {
  const rows = await prisma.$queryRaw<ReminderCustomerRow[]>`
    SELECT
      id,
      name,
      phone,
      "remindersEnabled" AS "remindersEnabled"
    FROM customers
    WHERE id = ${customerId} AND "businessId" = ${businessId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function listCustomersByBusiness(businessId: string, ids?: string[]) {
  const byIds = ids && ids.length > 0
  const rows = byIds
    ? await prisma.$queryRaw<ReminderCustomerRow[]>(Prisma.sql`
        SELECT id, name, phone, "remindersEnabled" AS "remindersEnabled"
        FROM customers
        WHERE "businessId" = ${businessId} AND "isActive" = true AND id IN (${Prisma.join(ids!)})
        ORDER BY name ASC
      `)
    : await prisma.$queryRaw<ReminderCustomerRow[]>`
        SELECT id, name, phone, "remindersEnabled" AS "remindersEnabled"
        FROM customers
        WHERE "businessId" = ${businessId} AND "isActive" = true
        ORDER BY name ASC
      `

  return rows
}

export async function getLedgerSnapshotsByCustomerIds(businessId: string, customerIds: string[]) {
  if (customerIds.length === 0) return []

  return prisma.$queryRaw<ReminderLedgerSnapshotRow[]>(Prisma.sql`
    SELECT
      la."customerId" AS "customerId",
      COALESCE(SUM(jl.debit - jl.credit), 0)::double precision AS balance,
      MIN(CASE WHEN jl.debit > 0 THEN je.date ELSE NULL END) AS "oldestDebitAt"
    FROM ledger_accounts la
    JOIN journal_lines jl ON jl."accountId" = la.id
    JOIN journal_entries je ON je.id = jl."entryId"
    WHERE la."businessId" = ${businessId}
      AND la."customerId" IN (${Prisma.join(customerIds)})
    GROUP BY la."customerId"
  `)
}

export interface GlobalOverdueCustomerRow {
  customerId: string
  name: string
  phone: string
  balance: number
  oldestDebitAt: Date | null
}

/**
 * Cross-tenant aggregate for the nightly reminder cron. Computes each active
 * customer's balance (debit − credit) and oldest open debit entirely in SQL,
 * returning only customers with a positive balance — so the worker never has to
 * load the whole ledger_entries table into memory.
 */
export async function getGlobalOverdueCustomers() {
  return prisma.$queryRaw<GlobalOverdueCustomerRow[]>`
    SELECT
      c.id AS "customerId",
      c.name AS name,
      c.phone AS phone,
      COALESCE(SUM(jl.debit - jl.credit), 0)::double precision AS balance,
      MIN(CASE WHEN jl.debit > 0 THEN je.date ELSE NULL END) AS "oldestDebitAt"
    FROM customers c
    INNER JOIN ledger_accounts la ON la."customerId" = c.id AND la."businessId" = c."businessId"
    INNER JOIN journal_lines jl ON jl."accountId" = la.id
    INNER JOIN journal_entries je ON je.id = jl."entryId"
    WHERE c."isActive" = true AND c."remindersEnabled" = true
    GROUP BY c.id, c.name, c.phone
    HAVING COALESCE(SUM(jl.debit - jl.credit), 0) > 0
  `
}

/**
 * Most recent successfully-sent reminder per customer. The nightly cron uses
 * this to catch up missed threshold nights without double-sending: a customer
 * is only queued if nothing was sent since their current overdue bucket was
 * crossed.
 */
export async function getLastSentReminderByCustomerIds(customerIds: string[]) {
  if (customerIds.length === 0) return []
  return prisma.$queryRaw<Array<{ customerId: string; lastSentAt: Date }>>(Prisma.sql`
    SELECT "customerId" AS "customerId", MAX("sentAt") AS "lastSentAt"
    FROM reminders
    WHERE "customerId" IN (${Prisma.join(customerIds)})
      AND status = 'SENT' AND "sentAt" IS NOT NULL
    GROUP BY "customerId"
  `)
}

export async function createReminder(input: {
  customerId: string
  channel: 'WHATSAPP' | 'SMS'
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  messageBody: string
  scheduledAt: Date
  sentAt?: Date
}) {
  const rows = await prisma.$queryRaw<CreatedReminderRow[]>(Prisma.sql`
    INSERT INTO reminders (
      "customerId",
      channel,
      status,
      "messageBody",
      "scheduledAt",
      "sentAt",
      "createdAt"
    ) VALUES (
      ${input.customerId},
      ${input.channel}::"ReminderChannel",
      ${input.status}::"ReminderStatus",
      ${input.messageBody},
      ${input.scheduledAt},
      ${input.sentAt ?? null},
      NOW()
    )
    RETURNING
      id,
      "customerId" AS "customerId",
      channel::text AS channel,
      status::text AS status,
      "messageBody" AS "messageBody",
      "scheduledAt" AS "scheduledAt",
      "sentAt" AS "sentAt",
      "createdAt" AS "createdAt"
  `)

  return rows[0]
}
