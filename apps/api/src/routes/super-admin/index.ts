import type { FastifyInstance } from 'fastify'
import { superAdminRepository } from '@cement-house/db'
import { CUSTOM_ONBOARDING_FEATURES } from '@cement-house/utils'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { invalidateAuthCachesForBusiness, requireSuperAdmin } from '../../middleware/auth'
import { createAuditLog } from '../../services/audit'
import { ensurePlatformSettings, invalidatePlatformSettingsCache } from '../../services/billing'
const OVERVIEW_CACHE_TTL_MS = 15_000
const ANALYTICS_CACHE_TTL_MS = 20_000
const superAdminOverviewCache = new Map<string, { expiresAt: number; value: any }>()
const superAdminOverviewInFlight = new Map<string, Promise<any>>()
const superAdminAnalyticsCache = new Map<string, { expiresAt: number; value: any }>()
const superAdminAnalyticsInFlight = new Map<string, Promise<any>>()
const DASHBOARD_CACHE_TTL_MS = 15_000
const dashboardCache = new Map<string, { expiresAt: number; value: any }>()
const dashboardInFlight = new Map<string, Promise<any>>()

const UpdateBusinessSchema = z.object({
  isActive: z.boolean().optional(),
  suspendedReason: z.string().max(300).nullable().optional(),
  subscriptionPlan: z.enum(['STARTER', 'PRO', 'ENTERPRISE']).optional(),
  subscriptionStatus: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED']).optional(),
  subscriptionEndsAt: z.string().nullable().optional(),
  subscriptionInterval: z.enum(['MONTHLY', 'YEARLY']).nullable().optional(),
  trialDaysOverride: z.number().int().min(1).max(90).nullable().optional(),
  monthlySubscriptionAmount: z.number().min(0).optional(),
  yearlySubscriptionAmount: z.number().min(0).optional(),
})

const UpdateBillingConfigSchema = z.object({
  trialDays: z.number().int().min(1).max(90),
  monthlyPrice: z.number().min(0),
  yearlyPrice: z.number().min(0),
  currency: z.string().min(3).max(3),
  trialRequiresCard: z.boolean(),
})

const ListBusinessesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})

const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().optional(),
  role: z.enum(['SUPER_ADMIN', 'OWNER', 'MUNIM']).optional(),
  sortBy: z.enum(['createdAt', 'name', 'role', 'status', 'business']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

const OverviewAnalyticsQuerySchema = z.object({
  range: z.enum(['1M', '3M', '6M', '1Y', 'CUSTOM']).default('1M'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

const UpdateSuperAdminProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(10),
  email: z.string().trim().email().optional(),
})

const UpdateSuperAdminPasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
})
const UpdateUserByAdminSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(10).max(10).optional(),
  email: z.string().trim().email().optional(),
  role: z.enum(['SUPER_ADMIN', 'OWNER', 'MUNIM']).optional(),
  isActive: z.boolean().optional(),
  permissions: z.array(z.string().trim().min(1)).optional(),
  password: z.string().min(6).max(128).optional(),
})

const PlanNameSchema = z.enum(['FREE', 'BASIC', 'PRO', 'ENTERPRISE'])

// Feature keys an admin may gate per plan. Sourced from the same catalog the
// registration flow shows, so plan gating and business config never drift.
const PLAN_GATEABLE_FEATURE_KEYS = new Set<string>(CUSTOM_ONBOARDING_FEATURES.map((feature) => feature.key))

const NullableLimitSchema = z.number().int().min(0).nullable().optional()

const UpdatePlanCatalogSchema = z.object({
  priceMonthly: z.number().min(0).optional(),
  priceYearly: z.number().min(0).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
  blockedFeatures: z
    .array(z.string().trim().min(1))
    .max(50)
    .optional()
    .refine(
      (keys) => !keys || keys.every((key) => PLAN_GATEABLE_FEATURE_KEYS.has(key)),
      { message: 'blockedFeatures contains an unknown feature key' },
    ),
  limits: z
    .object({
      maxUsers: NullableLimitSchema,
      maxProducts: NullableLimitSchema,
      maxCustomers: NullableLimitSchema,
      maxOrdersPerMonth: NullableLimitSchema,
      maxInvoicesPerMonth: NullableLimitSchema,
      allowExports: z.boolean().optional(),
      allowAdvancedReports: z.boolean().optional(),
      allowMultipleLocations: z.boolean().optional(),
    })
    .optional(),
})

const UpdatePlanPricingSchema = z.object({
  name: PlanNameSchema,
  priceMonthly: z.number().min(0),
  priceYearly: z.number().min(0),
  description: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
})

const AdminPaymentsQuerySchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

const AdminWebhooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

const SuspendBusinessSchema = z.object({
  reason: z.string().trim().max(300).optional(),
})

const ChangePlanSchema = z.object({
  // Real plan names from the plans table. STARTER is accepted as a legacy
  // alias (older UI builds) and normalized to BASIC.
  plan: z.enum(['FREE', 'BASIC', 'PRO', 'ENTERPRISE', 'STARTER']).transform((value) => (value === 'STARTER' ? 'BASIC' : value)),
})

const ExtendSubscriptionSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
})

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function safeAmount(value: unknown) {
  return Number(value ?? 0)
}

function authPayloadForUser(user: {
  id: string
  name: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  businessId: string | null
  permissions: string[]
  business?: {
    name: string
    city: string
    subscriptionStatus?: string
    subscriptionEndsAt?: Date | null
    subscriptionInterval?: 'MONTHLY' | 'YEARLY' | null
    monthlySubscriptionAmount?: unknown
    yearlySubscriptionAmount?: unknown
    trialStartedAt?: Date | null
    trialDaysOverride?: number | null
  } | null
}) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    businessId: user.businessId,
    businessName: user.business?.name ?? null,
    businessCity: user.business?.city ?? null,
    permissions: user.permissions,
    subscriptionStatus: user.business?.subscriptionStatus ?? null,
    subscriptionEndsAt: user.business?.subscriptionEndsAt?.toISOString?.() ?? null,
    subscriptionInterval: user.business?.subscriptionInterval ?? null,
    monthlySubscriptionAmount: Number(user.business?.monthlySubscriptionAmount ?? 0),
    yearlySubscriptionAmount: Number(user.business?.yearlySubscriptionAmount ?? 0),
    trialStartedAt: user.business?.trialStartedAt?.toISOString?.() ?? null,
    trialDaysOverride: user.business?.trialDaysOverride ?? null,
    accessLocked: false,
    accessReason: null,
  }
}

export async function superAdminRoutes(app: FastifyInstance) {
  // Structural guard: every route in this plugin requires SUPER_ADMIN, so a
  // handler that forgets its own check can never ship an open admin endpoint.
  // Individual handlers keep their explicit checks as defense in depth.
  app.addHook('preHandler', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return reply
  })

  app.get('/dashboard/overview', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const cacheKey = 'dashboard-overview'
    const cached = dashboardCache.get(cacheKey)
    const now = Date.now()
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }
    const inFlight = dashboardInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = superAdminRepository
      .getAdminDashboardOverview()
      .finally(() => dashboardInFlight.delete(cacheKey))
    dashboardInFlight.set(cacheKey, compute)
    const data = await compute
    dashboardCache.set(cacheKey, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  app.get('/dashboard/plan-distribution', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const cacheKey = 'dashboard-plan-distribution'
    const cached = dashboardCache.get(cacheKey)
    const now = Date.now()
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }
    const inFlight = dashboardInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }
    const compute = superAdminRepository
      .getAdminPlanDistribution()
      .finally(() => dashboardInFlight.delete(cacheKey))
    dashboardInFlight.set(cacheKey, compute)
    const data = await compute
    dashboardCache.set(cacheKey, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  app.get('/dashboard/revenue', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const cacheKey = 'dashboard-revenue'
    const cached = dashboardCache.get(cacheKey)
    const now = Date.now()
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }
    const inFlight = dashboardInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }
    const compute = superAdminRepository
      .getAdminRevenueAnalytics()
      .finally(() => dashboardInFlight.delete(cacheKey))
    dashboardInFlight.set(cacheKey, compute)
    const data = await compute
    dashboardCache.set(cacheKey, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  app.get('/payments', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const query = AdminPaymentsQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })
    const startDate = query.data.startDate ? new Date(query.data.startDate) : undefined
    const endDate = query.data.endDate ? new Date(query.data.endDate) : undefined
    if (startDate && Number.isNaN(startDate.getTime())) {
      return reply.status(400).send({ success: false, error: 'Invalid startDate' })
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      return reply.status(400).send({ success: false, error: 'Invalid endDate' })
    }

    const result = await superAdminRepository.listAdminPayments({
      status: query.data.status,
      startDate,
      endDate,
      page: query.data.page,
      pageSize: query.data.pageSize,
    })
    return {
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
      },
    }
  })

  app.get('/webhooks', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const query = AdminWebhooksQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })
    const result = await superAdminRepository.listAdminWebhookLogs(query.data)
    return {
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
      },
    }
  })

  app.get('/dashboard/businesses', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const data = await superAdminRepository.listAdminBusinessesForDashboard()
    return { success: true, data }
  })

  app.post('/businesses/:id/suspend', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    const body = SuspendBusinessSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    const business = await superAdminRepository.suspendBusinessByAdmin({
      businessId: id,
      reason: body.data.reason,
    })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    invalidateAuthCachesForBusiness(id)
    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: id,
      action: 'BUSINESS_SUSPENDED',
      targetType: 'BUSINESS',
      targetId: id,
      metadata: { reason: body.data.reason ?? null },
    })
    return { success: true, data: business }
  })

  app.post('/businesses/:id/change-plan', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    const body = ChangePlanSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    const business = await superAdminRepository.changeBusinessPlanByAdmin({
      businessId: id,
      plan: body.data.plan,
    })
    if (!business) return reply.status(404).send({ success: false, error: 'Business or plan not found' })
    invalidateAuthCachesForBusiness(id)
    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: id,
      action: 'BUSINESS_PLAN_CHANGED',
      targetType: 'BUSINESS',
      targetId: id,
      metadata: { plan: body.data.plan },
    })
    return { success: true, data: business }
  })

  app.post('/businesses/:id/extend-subscription', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const { id } = req.params as { id: string }
    const body = ExtendSubscriptionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })
    const business = await superAdminRepository.extendBusinessSubscriptionByAdmin({
      businessId: id,
      days: body.data.days,
    })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    invalidateAuthCachesForBusiness(id)
    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: id,
      action: 'SUBSCRIPTION_EXTENDED',
      targetType: 'BUSINESS',
      targetId: id,
      metadata: { days: body.data.days },
    })
    return { success: true, data: business }
  })

  app.get('/profile', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const currentUserId = (req.user as any).id as string
    const profile = await superAdminRepository.getSuperAdminProfile(currentUserId)

    if (!profile || profile.role !== 'SUPER_ADMIN') {
      return reply.status(404).send({ success: false, error: 'Super Admin profile not found' })
    }

    return { success: true, data: profile }
  })

  app.patch('/profile', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const currentUserId = (req.user as any).id as string
    const body = UpdateSuperAdminProfileSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const existing = await superAdminRepository.findUserByPhone(body.data.phone)
    if (existing && existing.id !== currentUserId) {
      return reply.status(409).send({ success: false, error: 'Phone number is already used by another user' })
    }
    if (body.data.email) {
      const existingEmail = await superAdminRepository.findUserByEmail(body.data.email)
      if (existingEmail && existingEmail.id !== currentUserId) {
        return reply.status(409).send({ success: false, error: 'Email is already used by another user' })
      }
    }

    const updated = await superAdminRepository.updateUserProfile(currentUserId, body.data.name, body.data.phone, body.data.email)
    if (!updated) return reply.status(404).send({ success: false, error: 'Super Admin profile not found' })

    const authUser = authPayloadForUser({
      id: updated.id,
      name: updated.name,
      role: updated.role,
      businessId: updated.businessId,
      permissions: updated.permissions,
      business: null,
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

    return {
      success: true,
      data: {
        profile: {
          id: updated.id,
          name: updated.name,
          phone: updated.phone,
          email: updated.email,
          role: updated.role,
        },
        session: {
          token,
          user: authUser,
        },
      },
    }
  })

  app.patch('/password', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const currentUserId = (req.user as any).id as string
    const body = UpdateSuperAdminPasswordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const currentUser = await superAdminRepository.getSuperAdminPassword(currentUserId)
    if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
      return reply.status(404).send({ success: false, error: 'Super Admin profile not found' })
    }

    const valid = await bcrypt.compare(body.data.currentPassword, currentUser.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Current password is incorrect' })

    const nextHash = await bcrypt.hash(body.data.newPassword, 10)
    await superAdminRepository.updateUserPassword(currentUserId, nextHash)

    return { success: true, data: { message: 'Password updated successfully' } }
  })

  app.get('/billing-config', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const settings = await ensurePlatformSettings()

    return {
      success: true,
      data: {
        trialDays: settings.trialDays,
        monthlyPrice: safeAmount(settings.monthlyPrice),
        yearlyPrice: safeAmount(settings.yearlyPrice),
        currency: settings.currency,
        trialRequiresCard: settings.trialRequiresCard,
      },
    }
  })

  app.patch('/billing-config', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const body = UpdateBillingConfigSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const settings = await superAdminRepository.upsertPlatformSettings({
      trialDays: body.data.trialDays,
      monthlyPrice: body.data.monthlyPrice,
      yearlyPrice: body.data.yearlyPrice,
      currency: body.data.currency.toUpperCase(),
      trialRequiresCard: body.data.trialRequiresCard,
    })

    // Platform settings hold the default/fallback price. Per-plan pricing is
    // managed via PUT /plan-pricing/:name — no longer mirrored from here, so
    // plan tiers can actually carry different prices.
    invalidatePlatformSettingsCache()

    return {
      success: true,
      data: {
        trialDays: settings.trialDays,
        monthlyPrice: safeAmount(settings.monthlyPrice),
        yearlyPrice: safeAmount(settings.yearlyPrice),
        currency: settings.currency,
        trialRequiresCard: settings.trialRequiresCard,
      },
    }
  })

  app.get('/plan-pricing', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const plans = await superAdminRepository.listAdminPlanPricing()
    return { success: true, data: plans }
  })

  // Full plan catalog: pricing + usage limits + per-plan feature gating.
  app.get('/plans', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const plans = await superAdminRepository.listAdminPlanCatalog()
    return {
      success: true,
      data: {
        plans,
        gateableFeatures: CUSTOM_ONBOARDING_FEATURES.map((feature) => ({ key: feature.key, label: feature.label })),
      },
    }
  })

  app.put('/plans/:name', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const params = z.object({ name: PlanNameSchema }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid plan name' })
    const body = UpdatePlanCatalogSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    // Trials are created on the FREE plan; deactivating it would break signup.
    if (params.data.name === 'FREE' && body.data.isActive === false) {
      return reply.status(400).send({ success: false, error: 'The FREE plan cannot be deactivated — trials depend on it' })
    }

    const updated = await superAdminRepository.updateAdminPlanCatalog({
      name: params.data.name,
      ...body.data,
    })
    if (!updated) return reply.status(404).send({ success: false, error: 'Plan not found' })

    invalidatePlatformSettingsCache()
    await createAuditLog({
      actorId: (req.user as any).id,
      action: 'PLAN_CATALOG_UPDATED',
      targetType: 'PLAN',
      targetId: updated.id,
      metadata: {
        plan: params.data.name,
        changedFields: Object.keys(body.data),
        blockedFeatures: body.data.blockedFeatures,
        limits: body.data.limits,
      },
    })
    return { success: true, data: updated }
  })

  app.put('/plan-pricing/:name', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const params = z.object({ name: PlanNameSchema }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid plan name' })
    const body = UpdatePlanPricingSchema.safeParse({ ...(req.body as Record<string, unknown>), name: params.data.name })
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const updated = await superAdminRepository.updateAdminPlanPricing(body.data)
    if (!updated) return reply.status(404).send({ success: false, error: 'Plan not found' })
    invalidatePlatformSettingsCache()
    return { success: true, data: updated }
  })

  app.get('/overview', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const cacheKey = 'overview'
    const nowMs = Date.now()
    const cached = superAdminOverviewCache.get(cacheKey)
    if (cached && cached.expiresAt > nowMs) {
      return { success: true, data: cached.value }
    }
    const inflight = superAdminOverviewInFlight.get(cacheKey)
    if (inflight) {
      const value = await inflight
      return { success: true, data: value }
    }

    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)
    const compute = (async () => {
      const overview = await superAdminRepository.getOverviewMetrics(todayStart, todayEnd)
      const businessRows = overview.businesses.map((business) => ({
        id: business.id,
        name: business.name,
        city: business.city,
        isActive: business.isActive,
        subscriptionPlan: business.subscriptionPlan,
        subscriptionStatus: business.subscriptionStatus,
        subscriptionEndsAt: business.subscriptionEndsAt,
        subscriptionInterval: business.subscriptionInterval,
        trialDaysOverride: business.trialDaysOverride,
        monthlySubscriptionAmount: safeAmount(business.monthlySubscriptionAmount),
        yearlySubscriptionAmount: safeAmount(business.yearlySubscriptionAmount),
        suspendedReason: business.suspendedReason,
        users: business.users,
        customers: business.customers,
        orders: business.orders,
        gmv: safeAmount(business.gmv),
        outstanding: safeAmount(business.outstanding),
        createdAt: business.createdAt,
      }))

      const revenueRunRate = businessRows
        .filter((business) => ['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(business.subscriptionStatus))
        .reduce((sum, business) => sum + business.monthlySubscriptionAmount, 0)

      const activityFeed = [
        ...overview.auditLogs.map((log) => ({
          id: log.id,
          kind: 'AUDIT',
          title: String(log.action).replace(/_/g, ' '),
          description: log.business?.name
            ? `${log.business.name}${log.actor?.name ? ` • by ${log.actor.name}` : ''}`
            : log.actor?.name ?? 'Platform activity',
          createdAt: log.createdAt,
        })),
        ...overview.failedReminders.map((reminder) => ({
          id: reminder.id,
          kind: 'ERROR',
          title: 'Failed WhatsApp reminder',
          description: `${reminder.customer.business.name} • ${reminder.customer.name}`,
          createdAt: reminder.createdAt,
        })),
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 12)

      return {
        platformHealth: {
          totalBusinesses: businessRows.length,
          activeBusinesses: businessRows.filter((business) => business.isActive).length,
          suspendedBusinesses: businessRows.filter((business) => !business.isActive).length,
          totalOwners: overview.counts.totalOwners,
          totalMunims: overview.counts.totalMunims,
          dailyActiveUsers: overview.counts.activeUsersToday,
        },
        financialVolume: {
          totalGMV: safeAmount(overview.totals.totalSales),
          todayGMV: safeAmount(overview.totals.todaySales),
          monthlyRevenueRunRate: revenueRunRate,
          pastDueAccounts: businessRows.filter((business) => business.subscriptionStatus === 'PAST_DUE').length,
          subscriptionRevenueInSelectedRange: safeAmount(overview.subscriptionTotals.inSelectedRange),
          totalSubscriptionRevenueTillDate: safeAmount(overview.subscriptionTotals.tillDate),
        },
        featureAdoption: {
          challanPdfsToday: overview.challansToday,
          remindersSentToday: overview.remindersToday,
          businessesOnPro: businessRows.filter((business) => business.subscriptionPlan === 'PRO').length,
          businessesInTrial: businessRows.filter((business) => business.subscriptionStatus === 'TRIAL').length,
        },
        topBusinesses: businessRows.sort((a, b) => b.gmv - a.gmv).slice(0, 5),
        activityFeed,
      }
    })()
    superAdminOverviewInFlight.set(cacheKey, compute)
    const data = await compute.finally(() => superAdminOverviewInFlight.delete(cacheKey))
    superAdminOverviewCache.set(cacheKey, { expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })


  app.get('/overview-analytics', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const query = OverviewAnalyticsQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const now = new Date()
    let startDate = new Date(now)
    let endDate = new Date(now)
    endDate.setHours(23, 59, 59, 999)

    if (query.data.range === '1M') {
      startDate.setMonth(startDate.getMonth() - 1)
    } else if (query.data.range === '3M') {
      startDate.setMonth(startDate.getMonth() - 3)
    } else if (query.data.range === '6M') {
      startDate.setMonth(startDate.getMonth() - 6)
    } else if (query.data.range === '1Y') {
      startDate.setFullYear(startDate.getFullYear() - 1)
    } else {
      if (!query.data.startDate || !query.data.endDate) {
        return reply.status(400).send({ success: false, error: 'startDate and endDate are required for CUSTOM range' })
      }
      startDate = new Date(query.data.startDate)
      endDate = new Date(query.data.endDate)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
    }

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return reply.status(400).send({ success: false, error: 'Invalid startDate or endDate' })
    }
    if (startDate > endDate) {
      return reply.status(400).send({ success: false, error: 'startDate cannot be after endDate' })
    }

    const cacheKey = `${query.data.range}:${startDate.toISOString()}:${endDate.toISOString()}`
    const nowMs = Date.now()
    const cached = superAdminAnalyticsCache.get(cacheKey)
    if (cached && cached.expiresAt > nowMs) {
      return {
        success: true,
        data: {
          range: query.data.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          summary: cached.value.summary,
          points: cached.value.points,
        },
      }
    }
    const inflight = superAdminAnalyticsInFlight.get(cacheKey)
    if (inflight) {
      const value = await inflight
      return {
        success: true,
        data: {
          range: query.data.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          summary: value.summary,
          points: value.points,
        },
      }
    }

    const compute = superAdminRepository.getOverviewAnalytics(startDate, endDate)
    superAdminAnalyticsInFlight.set(cacheKey, compute)
    const analytics = await compute.finally(() => superAdminAnalyticsInFlight.delete(cacheKey))
    superAdminAnalyticsCache.set(cacheKey, {
      expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
      value: analytics,
    })

    return {
      success: true,
      data: {
        range: query.data.range,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary: analytics.summary,
        points: analytics.points,
      },
    }
  })
  app.get('/businesses', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const query = ListBusinessesQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const { page, pageSize, search, status } = query.data
    const result = await superAdminRepository.listBusinesses({ page, pageSize, search, status })

    return {
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
      },
    }
  })

  app.get('/users', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const query = ListUsersQuerySchema.safeParse(req.query)
    if (!query.success) return reply.status(400).send({ success: false, error: query.error.message })

    const { page, pageSize, search, role, sortBy, sortOrder } = query.data
    const result = await superAdminRepository.listUsers({ page, pageSize, search, role, sortBy, sortOrder })

    return {
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
      },
    }
  })

  app.get('/users/:id', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid user id' })

    const user = await superAdminRepository.getUserById(params.data.id)
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })
    return { success: true, data: user }
  })

  app.patch('/users/:id', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid user id' })
    const body = UpdateUserByAdminSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const target = await superAdminRepository.getUserById(params.data.id)
    if (!target) return reply.status(404).send({ success: false, error: 'User not found' })

    const actorId = (req.user as any).id as string
    if (actorId === target.id) {
      if (body.data.role && body.data.role !== target.role) {
        return reply.status(400).send({ success: false, error: 'Use profile settings to change your own role' })
      }
      if (body.data.isActive === false) {
        return reply.status(400).send({ success: false, error: 'You cannot deactivate your own account' })
      }
    }

    if (body.data.phone) {
      const existingPhone = await superAdminRepository.findUserByPhone(body.data.phone)
      if (existingPhone && existingPhone.id !== target.id) {
        return reply.status(409).send({ success: false, error: 'Phone number is already used by another user' })
      }
    }
    if (body.data.email) {
      const existingEmail = await superAdminRepository.findUserByEmail(body.data.email)
      if (existingEmail && existingEmail.id !== target.id) {
        return reply.status(409).send({ success: false, error: 'Email is already used by another user' })
      }
    }

    const passwordHash = body.data.password ? await bcrypt.hash(body.data.password, 10) : undefined
    const updated = await superAdminRepository.updateUserBySuperAdmin({
      userId: target.id,
      name: body.data.name,
      phone: body.data.phone,
      role: body.data.role,
      isActive: body.data.isActive,
      permissions: body.data.permissions,
      email: body.data.email,
      passwordHash,
    })
    if (!updated) return reply.status(404).send({ success: false, error: 'User not found' })

    await createAuditLog({
      actorId,
      businessId: target.businessId ?? null,
      action: 'USER_UPDATED_BY_ADMIN',
      targetType: 'USER',
      targetId: target.id,
      // Field names only — values (especially password) must never reach the audit table.
      metadata: {
        changedFields: Object.keys(body.data),
        role: body.data.role ?? undefined,
        isActive: body.data.isActive ?? undefined,
      },
    })

    return { success: true, data: updated }
  })

  app.delete('/users/:id', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params)
    if (!params.success) return reply.status(400).send({ success: false, error: 'Invalid user id' })

    const target = await superAdminRepository.getUserById(params.data.id)
    if (!target) return reply.status(404).send({ success: false, error: 'User not found' })

    const actorId = (req.user as any).id as string
    if (actorId === target.id) {
      return reply.status(400).send({ success: false, error: 'You cannot delete your own account' })
    }

    const updated = await superAdminRepository.softDeleteUserBySuperAdmin(target.id)
    if (!updated) return reply.status(404).send({ success: false, error: 'User not found' })

    await createAuditLog({
      actorId,
      businessId: target.businessId ?? null,
      action: 'USER_DELETED_BY_ADMIN',
      targetType: 'USER',
      targetId: target.id,
      metadata: { userName: target.name, userRole: target.role },
    })

    return { success: true, data: updated }
  })

  app.patch('/businesses/:id', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const { id } = req.params as { id: string }
    const body = UpdateBusinessSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const current = await superAdminRepository.getBusinessById(id)
    if (!current) return reply.status(404).send({ success: false, error: 'Business not found' })

    const nextStatus =
      body.data.subscriptionStatus ??
      (body.data.isActive === false
        ? 'SUSPENDED'
        : body.data.isActive === true && current.subscriptionStatus === 'SUSPENDED'
          ? 'ACTIVE'
          : undefined)

    const business = await superAdminRepository.updateBusiness(id, {
      ...body.data,
      subscriptionStatus: nextStatus,
    })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })

    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: business.id,
      action: body.data.isActive === false ? 'BUSINESS_SUSPENDED' : 'BUSINESS_UPDATED',
      targetType: 'BUSINESS',
      targetId: business.id,
      metadata: body.data,
    })

    return { success: true, data: business }
  })

  app.post('/businesses/:id/impersonate', async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const { id } = req.params as { id: string }
    const business = await superAdminRepository.getBusinessForImpersonation(id)
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })

    const targetUser = business.users.find((user: any) => user.role === 'OWNER') ?? business.users[0]
    if (!targetUser) {
      return reply.status(404).send({ success: false, error: 'No active user available to impersonate' })
    }

    const actor = req.user as any
    const authUser = {
      ...authPayloadForUser({
        id: targetUser.id,
        name: targetUser.name,
        role: targetUser.role,
        businessId: targetUser.businessId ?? null,
        permissions: targetUser.permissions,
        business: {
          name: business.name,
          city: business.city,
          subscriptionStatus: business.subscriptionStatus,
          subscriptionEndsAt: business.subscriptionEndsAt,
          subscriptionInterval: business.subscriptionInterval,
          monthlySubscriptionAmount: business.monthlySubscriptionAmount,
          yearlySubscriptionAmount: business.yearlySubscriptionAmount,
          trialStartedAt: business.trialStartedAt,
          trialDaysOverride: business.trialDaysOverride,
        },
      }),
      // Bake the impersonating admin into the token itself so downstream
      // request logs and audit trails can attribute actions to the admin,
      // not the impersonated owner.
      impersonatedBy: actor.id as string,
      impersonatedByName: actor.name as string,
    }

    const token = app.jwt.sign(authUser, { expiresIn: '2h' })

    await createAuditLog({
      actorId: (req.user as any).id,
      businessId: business.id,
      action: 'IMPERSONATION_STARTED',
      targetType: 'USER',
      targetId: targetUser.id,
      metadata: {
        businessName: business.name,
        impersonatedUser: targetUser.name,
        impersonatedRole: targetUser.role,
      },
    })

    return {
      success: true,
      data: {
        token,
        user: authUser,
        impersonation: {
          businessId: business.id,
          businessName: business.name,
          actorName: (req.user as any).name,
          actorId: (req.user as any).id,
          startedAt: new Date().toISOString(),
        },
      },
    }
  })
}



