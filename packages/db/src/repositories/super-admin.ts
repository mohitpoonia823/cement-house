import { Prisma } from '@prisma/client'
import { prisma } from '../client'

let ensureUserEmailsTablePromise: Promise<void> | null = null

async function ensureUserEmailsTable() {
  if (!ensureUserEmailsTablePromise) {
    ensureUserEmailsTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_emails (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          email TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    })().catch((error) => {
      ensureUserEmailsTablePromise = null
      throw error
    })
  }
  await ensureUserEmailsTablePromise
}

export type AnalyticsRange = '1M' | '3M' | '6M' | '1Y' | 'CUSTOM'

export interface SuperAdminAnalyticsPoint {
  date: string
  gmv: number
  subscriptionRevenue: number
  newBusinesses: number
  activeUsers: number
}

export interface SuperAdminAnalyticsSummary {
  gmv: number
  subscriptionRevenue: number
  newBusinesses: number
  activeUsers: number
  totalSubscriptionRevenueTillDate: number
}

export async function getSuperAdminProfile(userId: string) {
  await ensureUserEmailsTable()
  const rows = await prisma.$queryRaw<Array<{
    id: string
    name: string
    phone: string
    email: string | null
    role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
    createdAt: Date
    lastSeenAt: Date | null
  }>>`
    SELECT
      u.id,
      u.name,
      u.phone,
      ue.email AS email,
      u.role::text AS role,
      u."createdAt" AS "createdAt",
      u."lastSeenAt" AS "lastSeenAt"
    FROM users u
    LEFT JOIN user_emails ue ON ue.user_id = u.id
    WHERE u.id = ${userId}
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

export async function findUserByEmail(email: string) {
  await ensureUserEmailsTable()
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT user_id AS id
    FROM user_emails
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function updateUserProfile(userId: string, name: string, phone: string, email?: string) {
  await ensureUserEmailsTable()
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE users
      SET name = ${name}, phone = ${phone}, "updatedAt" = NOW()
      WHERE id = ${userId}
    `
    if (email !== undefined) {
      await tx.$executeRaw`
        INSERT INTO user_emails (user_id, email)
        VALUES (${userId}, ${email})
        ON CONFLICT (user_id)
        DO UPDATE SET email = EXCLUDED.email
      `
    }
  })

  const rows = await prisma.$queryRaw<Array<{
    id: string
    name: string
    phone: string
    email: string | null
    role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
    permissions: string[]
    businessId: string | null
  }>>(Prisma.sql`
    SELECT
      u.id,
      u.name,
      u.phone,
      ue.email AS email,
      u.role::text AS role,
      u.permissions,
      u."businessId" AS "businessId"
    FROM users u
    INNER JOIN user_emails ue ON ue.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
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
        -- Effective price via the pricing hierarchy: per-business override
        -- (0 = none) -> assigned plan price -> platform default. Keeps MRR and
        -- run-rate truthful now that overrides are no longer auto-populated.
        COALESCE(
          NULLIF(b."monthlySubscriptionAmount", 0),
          pl."priceMonthly",
          ps."monthlyPrice",
          0
        )::double precision AS "monthlySubscriptionAmount",
        COALESCE(
          NULLIF(b."yearlySubscriptionAmount", 0),
          pl."priceYearly",
          ps."yearlyPrice",
          0
        )::double precision AS "yearlySubscriptionAmount",
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
      LEFT JOIN plans pl ON pl.name = (
        CASE b."subscriptionPlan"::text
          WHEN 'ENTERPRISE' THEN 'ENTERPRISE'
          WHEN 'PRO' THEN 'PRO'
          ELSE 'BASIC'
        END
      )
      LEFT JOIN platform_settings ps ON ps.id = 'default'
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
        SELECT la."businessId",
          COALESCE(SUM(jl.debit), 0)::double precision AS debit,
          COALESCE(SUM(jl.credit), 0)::double precision AS credit
        FROM ledger_accounts la
        JOIN journal_lines jl ON jl."accountId" = la.id
        WHERE la."customerId" IS NOT NULL
        GROUP BY la."businessId"
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
    subscriptionTotals: await getSubscriptionRevenueTotals(todayStart, todayEnd),
    remindersToday: reminders[0]?.remindersToday ?? 0,
    failedReminders,
    challansToday: challans[0]?.challansToday ?? 0,
    auditLogs,
  }
}

async function getSubscriptionRevenueTotals(rangeStart: Date, rangeEnd: Date) {
  const [rangeRows, allTimeRows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(amount), 0)::double precision AS total
      FROM payment_transactions
      WHERE status = 'SUCCEEDED'::"PaymentStatus"
        AND COALESCE("paidAt", "createdAt") >= ${rangeStart}
        AND COALESCE("paidAt", "createdAt") <= ${rangeEnd}
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(amount), 0)::double precision AS total
      FROM payment_transactions
      WHERE status = 'SUCCEEDED'::"PaymentStatus"
    `),
  ])

  return {
    inSelectedRange: rangeRows[0]?.total ?? 0,
    tillDate: allTimeRows[0]?.total ?? 0,
  }
}

export async function getOverviewAnalytics(startDate: Date, endDate: Date): Promise<{
  summary: SuperAdminAnalyticsSummary
  points: SuperAdminAnalyticsPoint[]
}> {
  const dayRows = await prisma.$queryRaw<Array<{
    date: Date
    gmv: number
    subscriptionRevenue: number
    newBusinesses: number
    activeUsers: number
  }>>(Prisma.sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${startDate}::timestamp),
        date_trunc('day', ${endDate}::timestamp),
        interval '1 day'
      )::date AS day
    ),
    sales AS (
      SELECT
        date_trunc('day', "createdAt")::date AS day,
        COALESCE(SUM("totalAmount"), 0)::double precision AS gmv
      FROM orders
      WHERE status <> 'CANCELLED'::"OrderStatus"
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY 1
    ),
    subscriptions AS (
      SELECT
        date_trunc('day', COALESCE("paidAt", "createdAt"))::date AS day,
        COALESCE(SUM(amount), 0)::double precision AS "subscriptionRevenue"
      FROM payment_transactions
      WHERE status = 'SUCCEEDED'::"PaymentStatus"
        AND COALESCE("paidAt", "createdAt") >= ${startDate}
        AND COALESCE("paidAt", "createdAt") <= ${endDate}
      GROUP BY 1
    ),
    businesses AS (
      SELECT
        date_trunc('day', "createdAt")::date AS day,
        COUNT(*)::int AS "newBusinesses"
      FROM businesses
      WHERE "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY 1
    ),
    active_users AS (
      SELECT
        date_trunc('day', "lastSeenAt")::date AS day,
        COUNT(DISTINCT id)::int AS "activeUsers"
      FROM users
      WHERE "isActive" = true
        AND "lastSeenAt" IS NOT NULL
        AND "lastSeenAt" >= ${startDate}
        AND "lastSeenAt" <= ${endDate}
      GROUP BY 1
    )
    SELECT
      d.day AS date,
      COALESCE(s.gmv, 0)::double precision AS gmv,
      COALESCE(sub."subscriptionRevenue", 0)::double precision AS "subscriptionRevenue",
      COALESCE(b."newBusinesses", 0)::int AS "newBusinesses",
      COALESCE(a."activeUsers", 0)::int AS "activeUsers"
    FROM days d
    LEFT JOIN sales s ON s.day = d.day
    LEFT JOIN subscriptions sub ON sub.day = d.day
    LEFT JOIN businesses b ON b.day = d.day
    LEFT JOIN active_users a ON a.day = d.day
    ORDER BY d.day ASC
  `)

  const [totals, allTimeSubscription] = await Promise.all([
    prisma.$queryRaw<Array<{
      gmv: number
      subscriptionRevenue: number
      newBusinesses: number
      activeUsers: number
    }>>(Prisma.sql`
      SELECT
        COALESCE((
          SELECT SUM("totalAmount")
          FROM orders
          WHERE status <> 'CANCELLED'::"OrderStatus"
            AND "createdAt" >= ${startDate}
            AND "createdAt" <= ${endDate}
        ), 0)::double precision AS gmv,
        COALESCE((
          SELECT SUM(amount)
          FROM payment_transactions
          WHERE status = 'SUCCEEDED'::"PaymentStatus"
            AND COALESCE("paidAt", "createdAt") >= ${startDate}
            AND COALESCE("paidAt", "createdAt") <= ${endDate}
        ), 0)::double precision AS "subscriptionRevenue",
        (
          SELECT COUNT(*)::int
          FROM businesses
          WHERE "createdAt" >= ${startDate}
            AND "createdAt" <= ${endDate}
        ) AS "newBusinesses",
        (
          SELECT COUNT(DISTINCT id)::int
          FROM users
          WHERE "isActive" = true
            AND "lastSeenAt" IS NOT NULL
            AND "lastSeenAt" >= ${startDate}
            AND "lastSeenAt" <= ${endDate}
        ) AS "activeUsers"
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COALESCE(SUM(amount), 0)::double precision AS total
      FROM payment_transactions
      WHERE status = 'SUCCEEDED'::"PaymentStatus"
    `),
  ])

  return {
    summary: {
      gmv: totals[0]?.gmv ?? 0,
      subscriptionRevenue: totals[0]?.subscriptionRevenue ?? 0,
      newBusinesses: totals[0]?.newBusinesses ?? 0,
      activeUsers: totals[0]?.activeUsers ?? 0,
      totalSubscriptionRevenueTillDate: allTimeSubscription[0]?.total ?? 0,
    },
    points: dayRows.map((row) => ({
      date: new Date(row.date).toISOString().slice(0, 10),
      gmv: row.gmv ?? 0,
      subscriptionRevenue: row.subscriptionRevenue ?? 0,
      newBusinesses: row.newBusinesses ?? 0,
      activeUsers: row.activeUsers ?? 0,
    })),
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
        SELECT la."businessId",
          COALESCE(SUM(jl.debit), 0)::double precision AS debit,
          COALESCE(SUM(jl.credit), 0)::double precision AS credit
        FROM ledger_accounts la
        JOIN journal_lines jl ON jl."accountId" = la.id
        WHERE la."customerId" IS NOT NULL
        GROUP BY la."businessId"
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
  sortBy?: 'createdAt' | 'name' | 'role' | 'status' | 'business'
  sortOrder?: 'asc' | 'desc'
}) {
  await ensureUserEmailsTable()
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
  const orderDirection = input.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const orderBy =
    input.sortBy === 'name'
      ? Prisma.sql`u.name ${orderDirection}, u."createdAt" DESC`
      : input.sortBy === 'role'
        ? Prisma.sql`u.role ${orderDirection}, u."createdAt" DESC`
        : input.sortBy === 'status'
          ? Prisma.sql`u."isActive" ${orderDirection}, u."createdAt" DESC`
          : input.sortBy === 'business'
            ? Prisma.sql`COALESCE(b.name, '') ${orderDirection}, u."createdAt" DESC`
            : Prisma.sql`u."createdAt" ${orderDirection}`

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        u.id,
        u.name,
        u.phone,
        ue.email AS email,
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
      LEFT JOIN user_emails ue ON ue.user_id = u.id
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY ${orderBy}
      OFFSET ${skip}
      LIMIT ${input.pageSize}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM users u
      LEFT JOIN businesses b ON b.id = u."businessId"
      LEFT JOIN user_emails ue ON ue.user_id = u.id
      WHERE ${Prisma.join(filters, ' AND ')}
    `),
  ])

  return { items, total: totalRows[0]?.count ?? 0 }
}

export async function getUserById(userId: string) {
  await ensureUserEmailsTable()
  const rows = await prisma.$queryRaw<Array<{
    id: string
    name: string
    phone: string
    email: string | null
    role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
    isActive: boolean
    permissions: string[]
    businessId: string | null
    businessName: string | null
    businessCity: string | null
    businessActive: boolean | null
    lastSeenAt: Date | null
    createdAt: Date
  }>>`
    SELECT
      u.id,
      u.name,
      u.phone,
      ue.email AS email,
      u.role::text AS role,
      u."isActive" AS "isActive",
      u.permissions,
      u."businessId" AS "businessId",
      b.name AS "businessName",
      b.city AS "businessCity",
      b."isActive" AS "businessActive",
      u."lastSeenAt" AS "lastSeenAt",
      u."createdAt" AS "createdAt"
    FROM users u
    LEFT JOIN businesses b ON b.id = u."businessId"
    LEFT JOIN user_emails ue ON ue.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function updateUserBySuperAdmin(input: {
  userId: string
  name?: string
  phone?: string
  role?: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  isActive?: boolean
  permissions?: string[]
  email?: string
  passwordHash?: string
}) {
  await ensureUserEmailsTable()
  await prisma.$transaction(async (tx) => {
    const updates: Prisma.Sql[] = []
    if (input.name !== undefined) updates.push(Prisma.sql`name = ${input.name}`)
    if (input.phone !== undefined) updates.push(Prisma.sql`phone = ${input.phone}`)
    if (input.role !== undefined) updates.push(Prisma.sql`role = ${input.role}::"UserRole"`)
    if (input.isActive !== undefined) updates.push(Prisma.sql`"isActive" = ${input.isActive}`)
    if (input.permissions !== undefined) updates.push(Prisma.sql`permissions = ${input.permissions}`)
    if (input.passwordHash !== undefined) updates.push(Prisma.sql`"passwordHash" = ${input.passwordHash}`)
    if (updates.length > 0) {
      updates.push(Prisma.sql`"updatedAt" = NOW()`)
      await tx.$executeRaw(Prisma.sql`
        UPDATE users
        SET ${Prisma.join(updates, ', ')}
        WHERE id = ${input.userId}
      `)
    }

    if (input.email !== undefined) {
      await tx.$executeRaw`
        INSERT INTO user_emails (user_id, email)
        VALUES (${input.userId}, ${input.email})
        ON CONFLICT (user_id)
        DO UPDATE SET email = EXCLUDED.email
      `
    }
  })

  return getUserById(input.userId)
}

export async function softDeleteUserBySuperAdmin(userId: string) {
  await prisma.$executeRaw`
    UPDATE users
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE id = ${userId}
  `
  return getUserById(userId)
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

export async function getAdminDashboardOverview() {
  const [overviewRows, revenueRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        totalBusinesses: number
        activeSubscriptions: number
        trialSubscriptions: number
        expiredSubscriptions: number
        failedPaymentsCount: number
        totalUsers: number
      }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM businesses) AS "totalBusinesses",
        (SELECT COUNT(*)::int FROM subscriptions WHERE status = 'ACTIVE') AS "activeSubscriptions",
        (SELECT COUNT(*)::int FROM subscriptions WHERE status = 'TRIAL') AS "trialSubscriptions",
        (SELECT COUNT(*)::int FROM subscriptions WHERE status = 'EXPIRED') AS "expiredSubscriptions",
        (SELECT COUNT(*)::int FROM payment_transactions WHERE status = 'FAILED') AS "failedPaymentsCount",
        (SELECT COUNT(*)::int FROM users) AS "totalUsers"
    `,
    prisma.$queryRaw<Array<{ totalRevenue: number }>>`
      SELECT COALESCE(SUM(amount), 0)::double precision AS "totalRevenue"
      FROM payment_transactions
      WHERE status = 'SUCCEEDED'::"PaymentStatus"
    `,
  ])

  return {
    totalBusinesses: overviewRows[0]?.totalBusinesses ?? 0,
    activeSubscriptions: overviewRows[0]?.activeSubscriptions ?? 0,
    trialSubscriptions: overviewRows[0]?.trialSubscriptions ?? 0,
    expiredSubscriptions: overviewRows[0]?.expiredSubscriptions ?? 0,
    totalRevenue: revenueRows[0]?.totalRevenue ?? 0,
    failedPaymentsCount: overviewRows[0]?.failedPaymentsCount ?? 0,
    totalUsers: overviewRows[0]?.totalUsers ?? 0,
  }
}

export async function getAdminPlanDistribution() {
  return prisma.$queryRaw<
    Array<{
      planName: string
      numberOfBusinesses: number
    }>
  >`
    SELECT
      p.name::text AS "planName",
      COUNT(s.id)::int AS "numberOfBusinesses"
    FROM plans p
    LEFT JOIN subscriptions s ON s."planId" = p.id AND s.status IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED')
    GROUP BY p.name
    ORDER BY COUNT(s.id) DESC, p.name ASC
  `
}

export async function getAdminRevenueAnalytics() {
  const [revenueByDay, revenueByMonth, revenueByPlan] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        day: string
        revenue: number
      }>
    >`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', NOW()) - interval '29 day',
          date_trunc('day', NOW()),
          interval '1 day'
        )::date AS day
      )
      SELECT
        d.day::text AS day,
        COALESCE(SUM(sp.amount), 0)::double precision AS revenue
      FROM days d
      LEFT JOIN payment_transactions sp
        ON date_trunc('day', sp."createdAt")::date = d.day
       AND sp.status = 'SUCCEEDED'::"PaymentStatus"
      GROUP BY d.day
      ORDER BY d.day ASC
    `,
    prisma.$queryRaw<
      Array<{
        month: string
        revenue: number
      }>
    >`
      SELECT
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
        COALESCE(SUM(amount), 0)::double precision AS revenue
      FROM payment_transactions
      WHERE status = 'SUCCEEDED'::"PaymentStatus"
      GROUP BY date_trunc('month', "createdAt")
      ORDER BY date_trunc('month', "createdAt") ASC
    `,
    prisma.$queryRaw<
      Array<{
        planName: string
        revenue: number
      }>
    >`
      SELECT
        p.name::text AS "planName",
        COALESCE(SUM(sp.amount), 0)::double precision AS revenue
      FROM payment_transactions sp
      INNER JOIN plans p ON p.id = (sp.metadata->>'planId')
      WHERE sp.status = 'SUCCEEDED'::"PaymentStatus"
      GROUP BY p.name
      ORDER BY revenue DESC, p.name ASC
    `,
  ])

  return { revenueByDay, revenueByMonth, revenueByPlan }
}

export async function listAdminPayments(input: {
  status?: 'SUCCESS' | 'FAILED' | 'PENDING'
  startDate?: Date
  endDate?: Date
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
  const filters: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (input.status) {
    const dbStatus = input.status === 'SUCCESS' ? 'SUCCEEDED' : input.status
    filters.push(Prisma.sql`sp.status = ${dbStatus}::"PaymentStatus"`)
  }
  if (input.startDate) filters.push(Prisma.sql`sp."createdAt" >= ${input.startDate}`)
  if (input.endDate) filters.push(Prisma.sql`sp."createdAt" <= ${input.endDate}`)

  const [items, totalRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        paymentId: string
        businessId: string
        businessName: string | null
        planName: string
        amount: number
        status: string
        createdAt: Date
      }>
    >(Prisma.sql`
      SELECT
        sp.id AS "paymentId",
        sp."businessId" AS "businessId",
        b.name AS "businessName",
        COALESCE((sp.metadata->>'planName')::text, p.name::text, 'STARTER') AS "planName",
        sp.amount::double precision AS amount,
        CASE WHEN sp.status = 'SUCCEEDED'::"PaymentStatus" THEN 'SUCCESS' ELSE sp.status::text END AS status,
        sp."createdAt" AS "createdAt"
      FROM payment_transactions sp
      LEFT JOIN plans p ON p.id = (sp.metadata->>'planId')
      LEFT JOIN businesses b ON b.id = sp."businessId"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY sp."createdAt" DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM payment_transactions sp
      WHERE ${Prisma.join(filters, ' AND ')}
    `),
  ])
  return { items, total: totalRows[0]?.count ?? 0, page, pageSize }
}

export async function listAdminWebhookLogs(input: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
  const [rows, total] = await Promise.all([
    prisma.razorpayWebhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { eventId: true, eventType: true, processed: true, processedAt: true, createdAt: true },
    }),
    prisma.razorpayWebhookEvent.count(),
  ])
  return {
    items: rows.map((row) => ({
      eventId: row.eventId,
      eventType: row.eventType,
      status: row.processed ? ('PROCESSED' as const) : ('PENDING' as const),
      processedAt: row.processedAt,
      error: null as string | null,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageSize,
  }
}

export async function listAdminBusinessesForDashboard() {
  return prisma.$queryRaw<
    Array<{
      businessId: string
      name: string
      plan: string
      subscriptionStatus: string
      subscriptionEndsAt: Date | null
      createdAt: Date
    }>
  >`
    SELECT
      b.id AS "businessId",
      b.name,
      b."subscriptionPlan"::text AS plan,
      b."subscriptionStatus"::text AS "subscriptionStatus",
      b."subscriptionEndsAt" AS "subscriptionEndsAt",
      b."createdAt" AS "createdAt"
    FROM businesses b
    ORDER BY b."createdAt" DESC
    LIMIT 500
  `
}

export async function suspendBusinessByAdmin(input: { businessId: string; reason?: string | null }) {
  return updateBusiness(input.businessId, {
    isActive: false,
    suspendedReason: input.reason ?? 'Suspended by super admin',
    subscriptionStatus: 'SUSPENDED',
  })
}

export type PlanNameV2 = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'

// Single bridge from real plan names to the legacy Business.subscriptionPlan
// enum, kept until that column is dropped. FREE has no legacy equivalent, so
// it maps to the lowest paid tier for display purposes.
function planNameToLegacy(name: PlanNameV2): 'STARTER' | 'PRO' | 'ENTERPRISE' {
  if (name === 'ENTERPRISE') return 'ENTERPRISE'
  if (name === 'PRO') return 'PRO'
  return 'STARTER'
}

/**
 * Point the business's live subscription row at the given plan. Entitlements
 * (limits/features) are read from the subscriptions table, so without this an
 * admin plan change would never take effect. Runs inside the caller's tx.
 */
async function syncSubscriptionPlanRow(
  tx: Prisma.TransactionClient,
  businessId: string,
  planId: string,
  businessStatus: string,
  businessEndsAt: Date | null,
) {
  const active = await tx.subscription.findFirst({
    where: { businessId, status: { in: ['TRIAL', 'ACTIVE'] } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (active) {
    await tx.subscription.update({ where: { id: active.id }, data: { planId } })
    return
  }
  // No live row (expired/cancelled business): revive the latest one so the
  // partial unique index (one TRIAL/ACTIVE row per business) is respected.
  const latest = await tx.subscription.findFirst({
    where: { businessId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  const status = businessStatus === 'TRIAL' ? 'TRIAL' : 'ACTIVE'
  if (latest) {
    await tx.subscription.update({
      where: { id: latest.id },
      data: { planId, status, endDate: businessEndsAt },
    })
    return
  }
  await tx.subscription.create({
    data: {
      id: `sub_admin_${businessId}_${Date.now()}`,
      businessId,
      planId,
      status,
      startDate: new Date(),
      endDate: businessEndsAt,
      trialEndDate: status === 'TRIAL' ? businessEndsAt : null,
      autoRenew: true,
    },
  })
}

export async function changeBusinessPlanByAdmin(input: {
  businessId: string
  plan: PlanNameV2
}) {
  const plan = await prisma.plan.findUnique({ where: { name: input.plan }, select: { id: true, isActive: true } })
  if (!plan || !plan.isActive) return null
  const current = await getBusinessById(input.businessId)
  if (!current) return null

  const business = await updateBusiness(input.businessId, {
    subscriptionPlan: planNameToLegacy(input.plan),
  })
  if (!business) return null

  await prisma.$transaction((tx) =>
    syncSubscriptionPlanRow(
      tx,
      input.businessId,
      plan.id,
      current.subscriptionStatus,
      current.subscriptionEndsAt ? new Date(current.subscriptionEndsAt) : null,
    ),
  )
  return business
}

export async function extendBusinessSubscriptionByAdmin(input: {
  businessId: string
  days: number
}) {
  const current = await getBusinessById(input.businessId)
  if (!current) return null
  const base = current.subscriptionEndsAt ? new Date(current.subscriptionEndsAt) : new Date()
  const next = new Date(base)
  next.setDate(next.getDate() + Math.max(1, input.days))
  const business = await updateBusiness(input.businessId, {
    subscriptionEndsAt: next.toISOString(),
    subscriptionStatus: current.subscriptionStatus === 'SUSPENDED' ? 'ACTIVE' : current.subscriptionStatus,
  })
  if (!business) return null

  // Mirror the new end date onto the live subscription row so entitlement
  // checks don't expire the business while the legacy row says it's paid up.
  await prisma.$transaction(async (tx) => {
    const live = await tx.subscription.findFirst({
      where: { businessId: input.businessId, status: { in: ['TRIAL', 'ACTIVE'] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    })
    if (live) {
      await tx.subscription.update({
        where: { id: live.id },
        data: { endDate: next, ...(live.status === 'TRIAL' ? { trialEndDate: next } : {}) },
      })
      return
    }
    const latest = await tx.subscription.findFirst({
      where: { businessId: input.businessId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    if (latest) {
      await tx.subscription.update({
        where: { id: latest.id },
        data: { status: 'ACTIVE', endDate: next },
      })
    }
  })
  return business
}

export type AdminPlanPricingRow = {
  id: string
  name: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'
  priceMonthly: number
  priceYearly: number
  description: string | null
  isActive: boolean
}

const PLAN_DISPLAY_ORDER: Record<string, number> = { FREE: 1, BASIC: 2, PRO: 3, ENTERPRISE: 4 }

export type AdminPlanCatalogLimits = {
  maxUsers: number | null
  maxProducts: number | null
  maxCustomers: number | null
  maxOrdersPerMonth: number | null
  maxInvoicesPerMonth: number | null
  allowExports: boolean
  allowAdvancedReports: boolean
  allowMultipleLocations: boolean
}

export type AdminPlanCatalogRow = {
  id: string
  name: PlanNameV2
  priceMonthly: number
  priceYearly: number
  description: string | null
  isActive: boolean
  /** Feature keys this plan blocks (plans.features entries whose value is false). */
  blockedFeatures: string[]
  limits: AdminPlanCatalogLimits | null
}

function toCatalogRow(plan: {
  id: string
  name: string
  priceMonthly: unknown
  priceYearly: unknown
  description: string | null
  isActive: boolean
  features: unknown
  limits: {
    maxUsers: number | null
    maxProducts: number | null
    maxCustomers: number | null
    maxOrdersPerMonth: number | null
    maxInvoicesPerMonth: number | null
    allowExports: boolean
    allowAdvancedReports: boolean
    allowMultipleLocations: boolean
  } | null
}): AdminPlanCatalogRow {
  const features = plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)
    ? (plan.features as Record<string, unknown>)
    : {}
  return {
    id: plan.id,
    name: plan.name as PlanNameV2,
    priceMonthly: Number(plan.priceMonthly ?? 0),
    priceYearly: Number(plan.priceYearly ?? 0),
    description: plan.description,
    isActive: plan.isActive,
    blockedFeatures: Object.entries(features)
      .filter(([, value]) => value === false)
      .map(([key]) => key),
    limits: plan.limits
      ? {
          maxUsers: plan.limits.maxUsers,
          maxProducts: plan.limits.maxProducts,
          maxCustomers: plan.limits.maxCustomers,
          maxOrdersPerMonth: plan.limits.maxOrdersPerMonth,
          maxInvoicesPerMonth: plan.limits.maxInvoicesPerMonth,
          allowExports: plan.limits.allowExports,
          allowAdvancedReports: plan.limits.allowAdvancedReports,
          allowMultipleLocations: plan.limits.allowMultipleLocations,
        }
      : null,
  }
}

export async function listAdminPlanCatalog(): Promise<AdminPlanCatalogRow[]> {
  const plans = await prisma.plan.findMany({
    include: {
      limits: {
        select: {
          maxUsers: true,
          maxProducts: true,
          maxCustomers: true,
          maxOrdersPerMonth: true,
          maxInvoicesPerMonth: true,
          allowExports: true,
          allowAdvancedReports: true,
          allowMultipleLocations: true,
        },
      },
    },
  })
  return plans
    .sort((a, b) => (PLAN_DISPLAY_ORDER[a.name] ?? 100) - (PLAN_DISPLAY_ORDER[b.name] ?? 100))
    .map(toCatalogRow)
}

export async function updateAdminPlanCatalog(input: {
  name: PlanNameV2
  priceMonthly?: number
  priceYearly?: number
  description?: string | null
  isActive?: boolean
  blockedFeatures?: string[]
  limits?: Partial<AdminPlanCatalogLimits>
}): Promise<AdminPlanCatalogRow | null> {
  const existing = await prisma.plan.findUnique({ where: { name: input.name }, select: { id: true } })
  if (!existing) return null

  const planData: Record<string, unknown> = {}
  if (input.priceMonthly !== undefined) planData.priceMonthly = input.priceMonthly
  if (input.priceYearly !== undefined) planData.priceYearly = input.priceYearly
  if (input.description !== undefined) planData.description = input.description
  if (input.isActive !== undefined) planData.isActive = input.isActive
  if (input.blockedFeatures !== undefined) {
    // plans.features is restrict-only: store an explicit false per blocked key;
    // absent keys inherit the business-level flag (see computeEntitlements).
    planData.features = Object.fromEntries(input.blockedFeatures.map((key) => [key, false]))
  }

  const updated = await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.update({
      where: { id: existing.id },
      data: planData,
    })
    if (input.limits !== undefined) {
      await tx.planLimit.upsert({
        where: { planId: existing.id },
        update: input.limits,
        create: {
          id: `limit_${input.name.toLowerCase()}`,
          planId: existing.id,
          maxUsers: input.limits.maxUsers ?? null,
          maxProducts: input.limits.maxProducts ?? null,
          maxCustomers: input.limits.maxCustomers ?? null,
          maxOrdersPerMonth: input.limits.maxOrdersPerMonth ?? null,
          maxInvoicesPerMonth: input.limits.maxInvoicesPerMonth ?? null,
          allowExports: input.limits.allowExports ?? false,
          allowAdvancedReports: input.limits.allowAdvancedReports ?? false,
          allowMultipleLocations: input.limits.allowMultipleLocations ?? false,
        },
      })
    }
    const limits = await tx.planLimit.findUnique({
      where: { planId: existing.id },
      select: {
        maxUsers: true,
        maxProducts: true,
        maxCustomers: true,
        maxOrdersPerMonth: true,
        maxInvoicesPerMonth: true,
        allowExports: true,
        allowAdvancedReports: true,
        allowMultipleLocations: true,
      },
    })
    return { ...plan, limits }
  })

  return toCatalogRow(updated)
}

export async function listAdminPlanPricing() {
  return prisma.$queryRaw<AdminPlanPricingRow[]>`
    SELECT
      id,
      name::text AS name,
      "priceMonthly"::double precision AS "priceMonthly",
      "priceYearly"::double precision AS "priceYearly",
      description,
      "isActive" AS "isActive"
    FROM plans
    ORDER BY
      CASE name
        WHEN 'FREE' THEN 1
        WHEN 'BASIC' THEN 2
        WHEN 'PRO' THEN 3
        WHEN 'ENTERPRISE' THEN 4
        ELSE 100
      END ASC
  `
}

export async function updateAdminPlanPricing(input: {
  name: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'
  priceMonthly: number
  priceYearly: number
  description?: string | null
  isActive?: boolean
}) {
  const rows = await prisma.$queryRaw<AdminPlanPricingRow[]>(Prisma.sql`
    INSERT INTO plans (id, name, "priceMonthly", "priceYearly", description, "isActive", features, "createdAt", "updatedAt")
    VALUES (
      ${`plan_${input.name.toLowerCase()}`},
      ${input.name},
      ${input.priceMonthly},
      ${input.priceYearly},
      ${input.description ?? null},
      COALESCE(${input.isActive ?? null}, TRUE),
      '{}'::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (name)
    DO UPDATE SET
      "priceMonthly" = EXCLUDED."priceMonthly",
      "priceYearly" = EXCLUDED."priceYearly",
      description = COALESCE(EXCLUDED.description, plans.description),
      "isActive" = COALESCE(${input.isActive ?? null}, plans."isActive"),
      "updatedAt" = NOW()
    RETURNING
      id,
      name::text AS name,
      "priceMonthly"::double precision AS "priceMonthly",
      "priceYearly"::double precision AS "priceYearly",
      description,
      "isActive" AS "isActive"
  `)
  return rows[0] ?? null
}

