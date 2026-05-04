import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../client'

export type PlanName = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'
export type SubscriptionStatusV2 = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED'
export type PaymentStatusV2 = 'PENDING' | 'SUCCESS' | 'FAILED'
export type BillingIntervalV2 = 'MONTHLY' | 'YEARLY'

export interface PlanRow {
  id: string
  name: PlanName
  priceMonthly: number
  priceYearly: number
  description: string | null
  isActive: boolean
  features: Record<string, unknown>
}

export interface PlanLimitRow {
  planId: string
  maxUsers: number | null
  maxProducts: number | null
  maxCustomers: number | null
  maxOrdersPerMonth: number | null
  maxInvoicesPerMonth: number | null
  storageLimit: number | null
  allowExports: boolean
  allowAdvancedReports: boolean
  allowMultipleLocations: boolean
}

export interface SubscriptionWithPlanRow {
  id: string
  businessId: string
  planId: string
  status: SubscriptionStatusV2
  startDate: Date | null
  endDate: Date | null
  trialEndDate: Date | null
  autoRenew: boolean
  createdAt: Date
  updatedAt: Date
  planName: PlanName
  priceMonthly: number
  priceYearly: number
  planFeatures: Record<string, unknown>
  limits: PlanLimitRow | null
}

export async function listActivePlans() {
  const rows = await prisma.$queryRaw<Array<{
    id: string
    name: PlanName
    priceMonthly: number
    priceYearly: number
    description: string | null
    isActive: boolean
    features: Record<string, unknown>
    maxUsers: number | null
    maxProducts: number | null
    maxCustomers: number | null
    maxOrdersPerMonth: number | null
    maxInvoicesPerMonth: number | null
    storageLimit: number | null
    allowExports: boolean
    allowAdvancedReports: boolean
    allowMultipleLocations: boolean
  }>>`
    SELECT
      p.id,
      p.name::text AS name,
      p."priceMonthly"::double precision AS "priceMonthly",
      p."priceYearly"::double precision AS "priceYearly",
      p.description,
      p."isActive" AS "isActive",
      p.features,
      l."maxUsers" AS "maxUsers",
      l."maxProducts" AS "maxProducts",
      l."maxCustomers" AS "maxCustomers",
      l."maxOrdersPerMonth" AS "maxOrdersPerMonth",
      l."maxInvoicesPerMonth" AS "maxInvoicesPerMonth",
      l."storageLimit"::double precision AS "storageLimit",
      l."allowExports" AS "allowExports",
      l."allowAdvancedReports" AS "allowAdvancedReports",
      l."allowMultipleLocations" AS "allowMultipleLocations"
    FROM plans p
    LEFT JOIN plan_limits l ON l."planId" = p.id
    WHERE p."isActive" = TRUE
    ORDER BY
      CASE p.name
        WHEN 'FREE' THEN 1
        WHEN 'BASIC' THEN 2
        WHEN 'PRO' THEN 3
        WHEN 'ENTERPRISE' THEN 4
        ELSE 100
      END ASC
  `
  return rows
}

export async function getPlanByName(name: PlanName) {
  const rows = await prisma.$queryRaw<PlanRow[]>`
    SELECT
      id,
      name::text AS name,
      "priceMonthly"::double precision AS "priceMonthly",
      "priceYearly"::double precision AS "priceYearly",
      description,
      "isActive" AS "isActive",
      features
    FROM plans
    WHERE name = ${name} AND "isActive" = TRUE
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getCurrentSubscriptionByBusiness(businessId: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string
    businessId: string
    planId: string
    status: SubscriptionStatusV2
    startDate: Date | null
    endDate: Date | null
    trialEndDate: Date | null
    autoRenew: boolean
    createdAt: Date
    updatedAt: Date
    planName: PlanName
    priceMonthly: number
    priceYearly: number
    planFeatures: Record<string, unknown>
    maxUsers: number | null
    maxProducts: number | null
    maxCustomers: number | null
    maxOrdersPerMonth: number | null
    maxInvoicesPerMonth: number | null
    storageLimit: number | null
    allowExports: boolean
    allowAdvancedReports: boolean
    allowMultipleLocations: boolean
  }>>`
    SELECT
      s.id,
      s."businessId" AS "businessId",
      s."planId" AS "planId",
      s.status::text AS status,
      s."startDate" AS "startDate",
      s."endDate" AS "endDate",
      s."trialEndDate" AS "trialEndDate",
      s."autoRenew" AS "autoRenew",
      s."createdAt" AS "createdAt",
      s."updatedAt" AS "updatedAt",
      p.name::text AS "planName",
      p."priceMonthly"::double precision AS "priceMonthly",
      p."priceYearly"::double precision AS "priceYearly",
      p.features AS "planFeatures",
      l."maxUsers" AS "maxUsers",
      l."maxProducts" AS "maxProducts",
      l."maxCustomers" AS "maxCustomers",
      l."maxOrdersPerMonth" AS "maxOrdersPerMonth",
      l."maxInvoicesPerMonth" AS "maxInvoicesPerMonth",
      l."storageLimit"::double precision AS "storageLimit",
      l."allowExports" AS "allowExports",
      l."allowAdvancedReports" AS "allowAdvancedReports",
      l."allowMultipleLocations" AS "allowMultipleLocations"
    FROM subscriptions s
    INNER JOIN plans p ON p.id = s."planId"
    LEFT JOIN plan_limits l ON l."planId" = p.id
    WHERE s."businessId" = ${businessId}
      AND s.status IN ('TRIAL', 'ACTIVE')
    ORDER BY s."updatedAt" DESC
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  const nowMs = Date.now()
  const endMs = row.endDate ? new Date(row.endDate).getTime() : null
  if (row.status === 'TRIAL' && endMs !== null && endMs < nowMs) {
    await prisma.$executeRaw`
      UPDATE subscriptions
      SET status = 'EXPIRED', "updatedAt" = NOW()
      WHERE id = ${row.id}
    `
    return getCurrentSubscriptionByBusiness(businessId)
  }
  if (row.status === 'ACTIVE' && endMs !== null && endMs < nowMs) {
    await prisma.$executeRaw`
      UPDATE subscriptions
      SET status = 'EXPIRED', "updatedAt" = NOW()
      WHERE id = ${row.id}
    `
    return getCurrentSubscriptionByBusiness(businessId)
  }
  const limits: PlanLimitRow | null = row.maxUsers === undefined ? null : {
    planId: row.planId,
    maxUsers: row.maxUsers,
    maxProducts: row.maxProducts,
    maxCustomers: row.maxCustomers,
    maxOrdersPerMonth: row.maxOrdersPerMonth,
    maxInvoicesPerMonth: row.maxInvoicesPerMonth,
    storageLimit: row.storageLimit,
    allowExports: row.allowExports,
    allowAdvancedReports: row.allowAdvancedReports,
    allowMultipleLocations: row.allowMultipleLocations,
  }
  return { ...row, limits }
}

export async function ensureDefaultSubscriptionForBusiness(input: {
  businessId: string
  trialDays: number
}) {
  const existing = await getCurrentSubscriptionByBusiness(input.businessId)
  if (existing) return existing
  const anyExisting = await prisma.$queryRaw<Array<{ exists: number }>>`
    SELECT 1::int AS exists
    FROM subscriptions
    WHERE "businessId" = ${input.businessId}
    LIMIT 1
  `
  if (anyExisting.length > 0) return null

  const now = new Date()
  const trialEnd = new Date(now)
  trialEnd.setDate(trialEnd.getDate() + Math.max(0, input.trialDays))

  const freePlanRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM plans
    WHERE name = 'FREE'
    ORDER BY "createdAt" ASC
    LIMIT 1
  `
  let freePlanId = freePlanRows[0]?.id
  if (!freePlanId) {
    freePlanId = 'plan_free'
    await prisma.$executeRaw`
      INSERT INTO plans (id, name, "priceMonthly", "priceYearly", description, "isActive", features, "createdAt", "updatedAt")
      VALUES (
        ${freePlanId},
        'FREE',
        0,
        0,
        'Starter free access',
        TRUE,
        ${{
          allowAdvancedReports: false,
          allowExports: false,
          allowMultipleLocations: false,
        } as Prisma.JsonObject},
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `
  }

  await prisma.$executeRaw`
    INSERT INTO subscriptions (
      id, "businessId", "planId", status, "startDate", "trialEndDate", "endDate", "autoRenew", "createdAt", "updatedAt"
    )
    VALUES (
      ${randomUUID()}, ${input.businessId}, ${freePlanId}, 'TRIAL', ${now}, ${trialEnd}, ${trialEnd}, TRUE, NOW(), NOW()
    )
    ON CONFLICT DO NOTHING
  `

  return getCurrentSubscriptionByBusiness(input.businessId)
}

export async function createPendingSubscriptionPayment(input: {
  businessId: string
  planId: string
  interval: BillingIntervalV2
  amount: number
  razorpayOrderId: string
  metadata?: Record<string, unknown>
}) {
  const id = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO subscription_payments (
      id, "businessId", "planId", "razorpayOrderId", amount, interval, status, metadata, "createdAt", "updatedAt"
    )
    VALUES (
      ${id}, ${input.businessId}, ${input.planId}, ${input.razorpayOrderId},
      ${input.amount}, ${input.interval}, 'PENDING', ${input.metadata ?? {} as Prisma.JsonObject}, NOW(), NOW()
    )
  `
  return id
}

function toLegacyPlan(planName: PlanName): 'STARTER' | 'PRO' | 'ENTERPRISE' {
  if (planName === 'ENTERPRISE') return 'ENTERPRISE'
  if (planName === 'PRO') return 'PRO'
  return 'STARTER'
}

export async function processRazorpayWebhookEvent(input: {
  eventId: string
  eventType: string
  razorpayOrderId: string | null
  razorpayPaymentId: string | null
  payload: Prisma.JsonObject
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string; processed: boolean }>>`
      SELECT id, processed
      FROM razorpay_webhook_events
      WHERE "eventId" = ${input.eventId}
      LIMIT 1
    `
    if (existing[0]?.processed) {
      return { processed: true as const, idempotent: true as const, paymentUpdated: false as const }
    }
    if (!existing[0]) {
      await tx.$executeRaw`
        INSERT INTO razorpay_webhook_events (
          id, "eventId", "eventType", "razorpayOrderId", "razorpayPaymentId", payload, processed, "createdAt"
        )
        VALUES (
          ${randomUUID()}, ${input.eventId}, ${input.eventType}, ${input.razorpayOrderId}, ${input.razorpayPaymentId},
          ${input.payload}, FALSE, NOW()
        )
      `
    }

    if (!input.razorpayOrderId) {
      await tx.$executeRaw`
        UPDATE razorpay_webhook_events
        SET processed = TRUE, "processedAt" = NOW()
        WHERE "eventId" = ${input.eventId}
      `
      return { processed: true as const, idempotent: false as const, paymentUpdated: false as const }
    }

    const payments = await tx.$queryRaw<Array<{
      id: string
      businessId: string
      planId: string
      interval: BillingIntervalV2
      status: PaymentStatusV2
      planName: PlanName
      priceMonthly: number
      priceYearly: number
    }>>`
      SELECT
        sp.id,
        sp."businessId" AS "businessId",
        sp."planId" AS "planId",
        sp.interval::text AS interval,
        sp.status::text AS status,
        p.name::text AS "planName",
        p."priceMonthly"::double precision AS "priceMonthly",
        p."priceYearly"::double precision AS "priceYearly"
      FROM subscription_payments sp
      INNER JOIN plans p ON p.id = sp."planId"
      WHERE sp."razorpayOrderId" = ${input.razorpayOrderId}
      LIMIT 1
    `
    const payment = payments[0]
    if (!payment) {
      await tx.$executeRaw`
        UPDATE razorpay_webhook_events
        SET processed = TRUE, "processedAt" = NOW()
        WHERE "eventId" = ${input.eventId}
      `
      return { processed: true as const, idempotent: false as const, paymentUpdated: false as const }
    }
    if (payment.status === 'SUCCESS' && input.eventType === 'payment.captured') {
      await tx.$executeRaw`
        UPDATE razorpay_webhook_events
        SET processed = TRUE, "processedAt" = NOW()
        WHERE "eventId" = ${input.eventId}
      `
      return { processed: true as const, idempotent: true as const, paymentUpdated: false as const }
    }

    if (input.eventType === 'payment.failed') {
      await tx.$executeRaw`
        UPDATE subscription_payments
        SET status = 'FAILED', "razorpayPaymentId" = COALESCE(${input.razorpayPaymentId}, "razorpayPaymentId"), "updatedAt" = NOW()
        WHERE id = ${payment.id}
      `
      await tx.$executeRaw`
        UPDATE razorpay_webhook_events
        SET processed = TRUE, "processedAt" = NOW()
        WHERE "eventId" = ${input.eventId}
      `
      return { processed: true as const, idempotent: false as const, paymentUpdated: true as const }
    }

    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + (payment.interval === 'YEARLY' ? 365 : 30))

    await tx.$executeRaw`
      UPDATE subscriptions
      SET status = 'EXPIRED', "updatedAt" = NOW()
      WHERE "businessId" = ${payment.businessId} AND status IN ('TRIAL', 'ACTIVE')
    `

    const subscriptionId = randomUUID()
    await tx.$executeRaw`
      INSERT INTO subscriptions (
        id, "businessId", "planId", status, "startDate", "endDate", "trialEndDate", "autoRenew", "createdAt", "updatedAt"
      )
      VALUES (
        ${subscriptionId}, ${payment.businessId}, ${payment.planId}, 'ACTIVE', ${now}, ${endDate}, NULL, TRUE, NOW(), NOW()
      )
    `

    await tx.$executeRaw`
      UPDATE subscription_payments
      SET
        status = 'SUCCESS',
        "subscriptionId" = ${subscriptionId},
        "razorpayPaymentId" = COALESCE(${input.razorpayPaymentId}, "razorpayPaymentId"),
        "updatedAt" = NOW()
      WHERE id = ${payment.id}
    `

    await tx.$executeRaw`
      UPDATE businesses
      SET
        "subscriptionPlan" = ${toLegacyPlan(payment.planName)}::"SubscriptionPlan",
        "subscriptionStatus" = 'ACTIVE'::"SubscriptionStatus",
        "subscriptionInterval" = ${payment.interval}::"BillingInterval",
        "subscriptionEndsAt" = ${endDate},
        "monthlySubscriptionAmount" = ${payment.priceMonthly},
        "yearlySubscriptionAmount" = ${payment.priceYearly},
        "suspendedReason" = NULL,
        "updatedAt" = NOW()
      WHERE id = ${payment.businessId}
    `

    await tx.$executeRaw`
      UPDATE razorpay_webhook_events
      SET processed = TRUE, "processedAt" = NOW()
      WHERE "eventId" = ${input.eventId}
    `

    return { processed: true as const, idempotent: false as const, paymentUpdated: true as const }
  })
}

export async function getUsageSummary(businessId: string) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [users, products, customers, monthOrders, monthInvoicesRows] = await Promise.all([
    prisma.user.count({ where: { businessId, isActive: true } }),
    prisma.material.count({ where: { businessId, isActive: true } }),
    prisma.customer.count({ where: { businessId, isActive: true } }),
    prisma.order.count({
      where: {
        businessId,
        isDeleted: false,
        createdAt: {
          gte: monthStart,
        },
      },
    }),
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE "businessId" = ${businessId}
        AND "isDeleted" = false
        AND "createdAt" >= ${monthStart}
        AND "invoiceNumber" IS NOT NULL
    `,
  ])

  return {
    users,
    products,
    customers,
    ordersThisMonth: monthOrders,
    invoicesThisMonth: monthInvoicesRows[0]?.count ?? 0,
  }
}
