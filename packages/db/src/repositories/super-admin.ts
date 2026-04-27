import { Prisma } from '@prisma/client'
import { prisma } from '../client'

export async function getSuperAdminProfile(userId: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string
    name: string
    phone: string
    role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
    createdAt: Date
    lastSeenAt: Date | null
  }>>`
    SELECT id, name, phone, role::text AS role, "createdAt" AS "createdAt", "lastSeenAt" AS "lastSeenAt"
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function findUserByPhone(phone: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE phone = ${phone} LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function updateUserProfile(userId: string, name: string, phone: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string
    name: string
    phone: string
    role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
    permissions: string[]
    businessId: string | null
  }>>(Prisma.sql`
    UPDATE users
    SET name = ${name}, phone = ${phone}, "updatedAt" = NOW()
    WHERE id = ${userId}
    RETURNING id, name, phone, role::text AS role, permissions, "businessId" AS "businessId"
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function getSuperAdminPassword(userId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'; passwordHash: string }>>`
    SELECT id, role::text AS role, "passwordHash" AS "passwordHash"
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  await prisma.$executeRaw`
    UPDATE users
    SET "passwordHash" = ${passwordHash}, "updatedAt" = NOW()
    WHERE id = ${userId}
  `
}

export async function upsertPlatformSettings(input: {
  trialDays: number
  monthlyPrice: number
  yearlyPrice: number
  currency: string
  trialRequiresCard: boolean
}) {
  const rows = await prisma.$queryRaw<Array<{
    id: string
    trialDays: number
    monthlyPrice: number
    yearlyPrice: number
    currency: string
    trialRequiresCard: boolean
  }>>(Prisma.sql`
    INSERT INTO platform_settings (
      id,
      "trialDays",
      "monthlyPrice",
      "yearlyPrice",
      currency,
      "trialRequiresCard",
      "createdAt",
      "updatedAt"
    ) VALUES (
      'default',
      ${input.trialDays},
      ${input.monthlyPrice},
      ${input.yearlyPrice},
      ${input.currency},
      ${input.trialRequiresCard},
      NOW(),
      NOW()
    )
    ON CONFLICT (id)
    DO UPDATE SET
      "trialDays" = EXCLUDED."trialDays",
      "monthlyPrice" = EXCLUDED."monthlyPrice",
      "yearlyPrice" = EXCLUDED."yearlyPrice",
      currency = EXCLUDED.currency,
      "trialRequiresCard" = EXCLUDED."trialRequiresCard",
      "updatedAt" = NOW()
    RETURNING
      id,
      "trialDays" AS "trialDays",
      "monthlyPrice"::double precision AS "monthlyPrice",
      "yearlyPrice"::double precision AS "yearlyPrice",
      currency,
      "trialRequiresCard" AS "trialRequiresCard"
  `)
  return rows[0]
}

export async function getOverviewMetrics(todayStart: Date, todayEnd: Date) {
  const [
    businesses,
    counts,
    totals,
    reminders,
    failedReminders,
    challans,
    auditLogs,
  ] = await Promise.all([
    prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        b.id,
        b.name,
        b.city,
        b."isActive" AS "isActive",
        b."subscriptionPlan"::text AS "subscriptionPlan",
        b."subscriptionStatus"::text AS "subscriptionStatus",
        b."monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
        b."yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
        b."subscriptionEndsAt" AS "subscriptionEndsAt",
        b."subscriptionInterval"::text AS "subscriptionInterval",
        b."trialDaysOverride" AS "trialDaysOverride",
        b."suspendedReason" AS "suspendedReason",
        b."createdAt" AS "createdAt",
        COALESCE(u.user_count, 0)::int AS users,
        COALESCE(c.customer_count, 0)::int AS customers,
        COALESCE(o.order_count, 0)::int AS orders,
        COALESCE(o.gmv, 0)::double precision AS gmv,
        (COALESCE(l.debit, 0) - COALESCE(l.credit, 0))::double precision AS outstanding
      FROM businesses b
      LEFT JOIN (
        SELECT "businessId", COUNT(*) AS user_count
        FROM users
        GROUP BY "businessId"
      ) u ON u."businessId" = b.id
      LEFT JOIN (
        SELECT "businessId", COUNT(*) AS customer_count
        FROM customers
        GROUP BY "businessId"
      ) c ON c."businessId" = b.id
      LEFT JOIN (
        SELECT "businessId", COUNT(*) AS order_count,
          COALESCE(SUM(CASE WHEN status <> 'CANCELLED'::"OrderStatus" THEN "totalAmount" ELSE 0 END),0)::double precision AS gmv
        FROM orders
        GROUP BY "businessId"
      ) o ON o."businessId" = b.id
      LEFT JOIN (
        SELECT "businessId",
          COALESCE(SUM(CASE WHEN type = 'DEBIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)::double precision AS debit,
          COALESCE(SUM(CASE WHEN type = 'CREDIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)::double precision AS credit
        FROM ledger_entries
        GROUP BY "businessId"
      ) l ON l."businessId" = b.id
      ORDER BY b."createdAt" DESC
    `),
    prisma.$queryRaw<Array<{ totalOwners: number; totalMunims: number; activeUsersToday: number }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE "isActive" = true AND role = 'OWNER'::"UserRole") AS "totalOwners",
        (SELECT COUNT(*)::int FROM users WHERE "isActive" = true AND role = 'MUNIM'::"UserRole") AS "totalMunims",
        (SELECT COUNT(*)::int FROM users WHERE "isActive" = true AND "lastSeenAt" >= ${todayStart} AND "lastSeenAt" <= ${todayEnd}) AS "activeUsersToday"
    `),
    prisma.$queryRaw<Array<{ totalSales: number; todaySales: number }>>(Prisma.sql`
      SELECT
        COALESCE((SELECT SUM("totalAmount") FROM orders WHERE status <> 'CANCELLED'::"OrderStatus"), 0)::double precision AS "totalSales",
        COALESCE((SELECT SUM("totalAmount") FROM orders WHERE status <> 'CANCELLED'::"OrderStatus" AND "createdAt" >= ${todayStart} AND "createdAt" <= ${todayEnd}), 0)::double precision AS "todaySales"
    `),
    prisma.$queryRaw<Array<{ remindersToday: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "remindersToday"
      FROM reminders
      WHERE status = 'SENT'::"ReminderStatus" AND "sentAt" >= ${todayStart} AND "sentAt" <= ${todayEnd}
    `),
    prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        r.id,
        r."createdAt" AS "createdAt",
        json_build_object(
          'name', c.name,
          'business', json_build_object('name', b.name)
        ) AS customer
      FROM reminders r
      INNER JOIN customers c ON c.id = r."customerId"
      INNER JOIN businesses b ON b.id = c."businessId"
      WHERE r.status = 'FAILED'::"ReminderStatus"
      ORDER BY r."createdAt" DESC
      LIMIT 6
    `),
    prisma.$queryRaw<Array<{ challansToday: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "challansToday"
      FROM audit_logs
      WHERE action = 'CHALLAN_PDF_GENERATED' AND "createdAt" >= ${todayStart} AND "createdAt" <= ${todayEnd}
    `),
    prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        a.id,
        a.action,
        a."createdAt" AS "createdAt",
        CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('name', u.name, 'role', u.role::text) END AS actor,
        CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('name', b.name, 'city', b.city) END AS business
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a."actorId"
      LEFT JOIN businesses b ON b.id = a."businessId"
      ORDER BY a."createdAt" DESC
      LIMIT 10
    `),
  ])

  return {
    businesses,
    counts: counts[0] ?? { totalOwners: 0, totalMunims: 0, activeUsersToday: 0 },
    totals: totals[0] ?? { totalSales: 0, todaySales: 0 },
    remindersToday: reminders[0]?.remindersToday ?? 0,
    failedReminders,
    challansToday: challans[0]?.challansToday ?? 0,
    auditLogs,
  }
}

export async function listBusinesses(input: {
  page: number
  pageSize: number
  search?: string
  status?: 'ACTIVE' | 'SUSPENDED'
}) {
  const filters: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (input.status === 'ACTIVE') filters.push(Prisma.sql`b."isActive" = true`)
  if (input.status === 'SUSPENDED') filters.push(Prisma.sql`b."isActive" = false`)
  if (input.search) {
    filters.push(Prisma.sql`(
      b.name ILIKE ${`%${input.search}%`}
      OR b.city ILIKE ${`%${input.search}%`}
      OR COALESCE(b.phone, '') ILIKE ${`%${input.search}%`}
    )`)
  }

  const skip = (input.page - 1) * input.pageSize

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        b.id,
        b.name,
        b.city,
        b.phone,
        b.gstin,
        b."isActive" AS "isActive",
        b."suspendedReason" AS "suspendedReason",
        b."subscriptionPlan"::text AS "subscriptionPlan",
        b."subscriptionStatus"::text AS "subscriptionStatus",
        b."subscriptionEndsAt" AS "subscriptionEndsAt",
        b."subscriptionInterval"::text AS "subscriptionInterval",
        b."trialDaysOverride" AS "trialDaysOverride",
        b."monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
        b."yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
        b."createdAt" AS "createdAt",
        b."updatedAt" AS "updatedAt",
        o.owner_name AS "ownerName",
        o.owner_phone AS "ownerPhone",
        COALESCE(u.user_count, 0)::int AS "totalUsers",
        COALESCE(c.customer_count, 0)::int AS "totalCustomers",
        COALESCE(od.order_count, 0)::int AS "totalOrders",
        COALESCE(od.gmv, 0)::double precision AS gmv,
        (COALESCE(l.debit, 0) - COALESCE(l.credit, 0))::double precision AS outstanding
      FROM businesses b
      LEFT JOIN (
        SELECT DISTINCT ON ("businessId")
          "businessId", name AS owner_name, phone AS owner_phone
        FROM users
        WHERE role = 'OWNER'::"UserRole" AND "isActive" = true
        ORDER BY "businessId", "createdAt" ASC
      ) o ON o."businessId" = b.id
      LEFT JOIN (
        SELECT "businessId", COUNT(*) AS user_count FROM users GROUP BY "businessId"
      ) u ON u."businessId" = b.id
      LEFT JOIN (
        SELECT "businessId", COUNT(*) AS customer_count FROM customers GROUP BY "businessId"
      ) c ON c."businessId" = b.id
      LEFT JOIN (
        SELECT "businessId",
          COUNT(*) AS order_count,
          COALESCE(SUM(CASE WHEN status <> 'CANCELLED'::"OrderStatus" THEN "totalAmount" ELSE 0 END), 0)::double precision AS gmv
        FROM orders
        GROUP BY "businessId"
      ) od ON od."businessId" = b.id
      LEFT JOIN (
        SELECT "businessId",
          COALESCE(SUM(CASE WHEN type = 'DEBIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)::double precision AS debit,
          COALESCE(SUM(CASE WHEN type = 'CREDIT'::"LedgerEntryType" THEN amount ELSE 0 END), 0)::double precision AS credit
        FROM ledger_entries
        GROUP BY "businessId"
      ) l ON l."businessId" = b.id
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY b."createdAt" DESC
      OFFSET ${skip}
      LIMIT ${input.pageSize}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM businesses b
      WHERE ${Prisma.join(filters, ' AND ')}
    `),
  ])

  return { items, total: totalRows[0]?.count ?? 0 }
}

export async function listUsers(input: {
  page: number
  pageSize: number
  search?: string
  role?: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
}) {
  const filters: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (input.role) filters.push(Prisma.sql`u.role = ${input.role}::"UserRole"`)
  if (input.search) {
    filters.push(Prisma.sql`(
      u.name ILIKE ${`%${input.search}%`}
      OR u.phone ILIKE ${`%${input.search}%`}
      OR COALESCE(b.name, '') ILIKE ${`%${input.search}%`}
    )`)
  }

  const skip = (input.page - 1) * input.pageSize

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        u.id,
        u.name,
        u.phone,
        u.role::text AS role,
        u."isActive" AS "isActive",
        u.permissions,
        u."lastSeenAt" AS "lastSeenAt",
        u."createdAt" AS "createdAt",
        u."businessId" AS "businessId",
        b.name AS "businessName",
        b.city AS "businessCity",
        b."isActive" AS "businessActive"
      FROM users u
      LEFT JOIN businesses b ON b.id = u."businessId"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY u."createdAt" DESC
      OFFSET ${skip}
      LIMIT ${input.pageSize}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM users u
      LEFT JOIN businesses b ON b.id = u."businessId"
      WHERE ${Prisma.join(filters, ' AND ')}
    `),
  ])

  return { items, total: totalRows[0]?.count ?? 0 }
}

export async function getBusinessById(businessId: string) {
  const rows = await prisma.$queryRaw<Array<any>>`
    SELECT
      id,
      name,
      city,
      phone,
      gstin,
      "isActive" AS "isActive",
      "suspendedReason" AS "suspendedReason",
      "subscriptionPlan"::text AS "subscriptionPlan",
      "subscriptionStatus"::text AS "subscriptionStatus",
      "subscriptionEndsAt" AS "subscriptionEndsAt",
      "subscriptionInterval"::text AS "subscriptionInterval",
      "trialDaysOverride" AS "trialDaysOverride",
      "monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      "yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount"
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function updateBusiness(businessId: string, data: {
  isActive?: boolean
  suspendedReason?: string | null
  subscriptionPlan?: 'STARTER' | 'PRO' | 'ENTERPRISE'
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED'
  subscriptionEndsAt?: string | null
  subscriptionInterval?: 'MONTHLY' | 'YEARLY' | null
  trialDaysOverride?: number | null
  monthlySubscriptionAmount?: number
  yearlySubscriptionAmount?: number
}) {
  const updates: Prisma.Sql[] = []
  if (data.isActive !== undefined) updates.push(Prisma.sql`"isActive" = ${data.isActive}`)
  if (data.suspendedReason !== undefined) updates.push(Prisma.sql`"suspendedReason" = ${data.suspendedReason}`)
  if (data.subscriptionPlan !== undefined) updates.push(Prisma.sql`"subscriptionPlan" = ${data.subscriptionPlan}::"SubscriptionPlan"`)
  if (data.subscriptionStatus !== undefined) updates.push(Prisma.sql`"subscriptionStatus" = ${data.subscriptionStatus}::"SubscriptionStatus"`)
  if (data.subscriptionEndsAt !== undefined) updates.push(Prisma.sql`"subscriptionEndsAt" = ${data.subscriptionEndsAt ? new Date(data.subscriptionEndsAt) : null}`)
  if (data.subscriptionInterval !== undefined) {
    if (data.subscriptionInterval === null) {
      updates.push(Prisma.sql`"subscriptionInterval" = NULL`)
    } else {
      updates.push(Prisma.sql`"subscriptionInterval" = ${data.subscriptionInterval}::"BillingInterval"`)
    }
  }
  if (data.trialDaysOverride !== undefined) updates.push(Prisma.sql`"trialDaysOverride" = ${data.trialDaysOverride}`)
  if (data.monthlySubscriptionAmount !== undefined) updates.push(Prisma.sql`"monthlySubscriptionAmount" = ${data.monthlySubscriptionAmount}`)
  if (data.yearlySubscriptionAmount !== undefined) updates.push(Prisma.sql`"yearlySubscriptionAmount" = ${data.yearlySubscriptionAmount}`)
  updates.push(Prisma.sql`"updatedAt" = NOW()`)

  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    UPDATE businesses
    SET ${Prisma.join(updates, ', ')}
    WHERE id = ${businessId}
    RETURNING
      id,
      name,
      city,
      "isActive" AS "isActive",
      "suspendedReason" AS "suspendedReason",
      "subscriptionPlan"::text AS "subscriptionPlan",
      "subscriptionStatus"::text AS "subscriptionStatus",
      "subscriptionEndsAt" AS "subscriptionEndsAt",
      "subscriptionInterval"::text AS "subscriptionInterval",
      "trialDaysOverride" AS "trialDaysOverride",
      "monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      "yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount"
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function getBusinessForImpersonation(businessId: string) {
  const businessRows = await prisma.$queryRaw<Array<any>>`
    SELECT
      id,
      name,
      city,
      "subscriptionStatus"::text AS "subscriptionStatus",
      "subscriptionEndsAt" AS "subscriptionEndsAt",
      "subscriptionInterval"::text AS "subscriptionInterval",
      "monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      "yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
      "trialStartedAt" AS "trialStartedAt",
      "trialDaysOverride" AS "trialDaysOverride"
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `
  const business = businessRows[0]
  if (!business) return null

  const users = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      id,
      name,
      role::text AS role,
      permissions,
      "businessId" AS "businessId",
      "createdAt" AS "createdAt"
    FROM users
    WHERE "businessId" = ${businessId} AND "isActive" = true
    ORDER BY role ASC, "createdAt" ASC
  `)

  return { ...business, users }
}
