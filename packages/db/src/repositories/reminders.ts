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
      "customerId" AS "customerId",
      (
        COALESCE(SUM(CASE WHEN type = 'DEBIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)
        -
        COALESCE(SUM(CASE WHEN type = 'CREDIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)
      )::double precision AS balance,
      MIN(CASE WHEN type = 'DEBIT'::"LedgerEntryType" THEN "createdAt" ELSE NULL END) AS "oldestDebitAt"
    FROM ledger_entries
    WHERE "businessId" = ${businessId}
      AND "customerId" IN (${Prisma.join(customerIds)})
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
