import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createHmac } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { settingsRepository, subscriptionsRepository } from '@cement-house/db'
import {
  BUSINESS_TYPE_VALUES,
  normalizeBusinessType,
  normalizeCustomFeatureFlags,
  normalizeCustomModules,
  validateCustomBusinessSelection,
} from '@cement-house/utils'
import { getBizId, requireOwner } from '../../middleware/auth'
import { ensureUsageAllowed, getSubscriptionAccessContext } from '../../services/subscription-access'
import {
  type BusinessWithBilling,
  computeBusinessAccess,
  ensurePlatformSettings,
} from '../../services/billing'

const SETTINGS_CACHE_TTL_MS = 10_000
const SETTINGS_SUBSCRIPTION_CACHE_TTL_MS = 10_000
const SETTINGS_STAFF_CACHE_TTL_MS = 10_000
const SETTINGS_SUBSCRIPTION_USAGE_CACHE_TTL_MS = 10_000
const SETTINGS_BOOTSTRAP_CACHE_TTL_MS = 10_000
const settingsCache = new Map<string, { expiresAt: number; value: any }>()
const settingsInFlight = new Map<string, Promise<any>>()
const settingsSubscriptionCache = new Map<string, { expiresAt: number; value: any }>()
const settingsSubscriptionInFlight = new Map<string, Promise<any>>()
const settingsStaffCache = new Map<string, { expiresAt: number; value: any }>()
const settingsStaffInFlight = new Map<string, Promise<any>>()
const settingsSubscriptionUsageCache = new Map<string, { expiresAt: number; value: any }>()
const settingsSubscriptionUsageInFlight = new Map<string, Promise<any>>()
const settingsBootstrapCache = new Map<string, { expiresAt: number; value: any }>()
const settingsBootstrapInFlight = new Map<string, Promise<any>>()

function clearSettingsCacheByPrefix(prefix: string) {
  for (const key of settingsCache.keys()) if (key.startsWith(prefix)) settingsCache.delete(key)
  for (const key of settingsInFlight.keys()) if (key.startsWith(prefix)) settingsInFlight.delete(key)
  for (const key of settingsSubscriptionCache.keys()) if (key.startsWith(prefix)) settingsSubscriptionCache.delete(key)
  for (const key of settingsSubscriptionInFlight.keys()) if (key.startsWith(prefix)) settingsSubscriptionInFlight.delete(key)
  for (const key of settingsStaffCache.keys()) if (key.startsWith(prefix)) settingsStaffCache.delete(key)
  for (const key of settingsStaffInFlight.keys()) if (key.startsWith(prefix)) settingsStaffInFlight.delete(key)
  for (const key of settingsSubscriptionUsageCache.keys()) if (key.startsWith(prefix)) settingsSubscriptionUsageCache.delete(key)
  for (const key of settingsSubscriptionUsageInFlight.keys()) if (key.startsWith(prefix)) settingsSubscriptionUsageInFlight.delete(key)
  for (const key of settingsBootstrapCache.keys()) if (key.startsWith(prefix)) settingsBootstrapCache.delete(key)
  for (const key of settingsBootstrapInFlight.keys()) if (key.startsWith(prefix)) settingsBootstrapInFlight.delete(key)
}

function invalidateSettingsCaches(businessId: string, userId?: string) {
  clearSettingsCacheByPrefix(`${businessId}:`)
  if (userId) clearSettingsCacheByPrefix(`${businessId}:${userId}`)
}

const UpdateBusinessSchema = z.object({
  name: z.string().min(2).optional(),
  city: z.string().min(2).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  stateCode: z.string().trim().length(2).optional(),
  businessType: z.enum(BUSINESS_TYPE_VALUES).optional(),
  customLabels: z
    .object({
      inventory: z.string().trim().min(1).max(40).optional(),
      material: z.string().trim().min(1).max(40).optional(),
      customer: z.string().trim().min(1).max(40).optional(),
      supplier: z.string().trim().min(1).max(40).optional(),
      businessTypeName: z.string().trim().min(1).max(60).optional(),
    })
    .optional(),
})

const UpdateReminderRulesSchema = z.object({
  remindersEnabled: z.boolean().optional(),
  reminderSoftDays: z.number().min(1).optional(),
  reminderFollowDays: z.number().min(1).optional(),
  reminderFirmDays: z.number().min(1).optional(),
})

const UpdateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).max(10).optional(),
  email: z.string().trim().email().optional(),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
})

const OptionalStaffEmailSchema = z.preprocess((value) => {
  if (value === null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}, z.string().trim().email().nullable().optional())

const CreateStaffSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(10),
  email: OptionalStaffEmailSchema,
  password: z.string().min(6),
  permissions: z.array(z.string()).default([]),
})

const UpdateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).max(10).optional(),
  email: OptionalStaffEmailSchema,
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

const SubscriptionCheckoutInitiateSchema = z.object({
  planName: z.enum(['FREE', 'BASIC', 'PRO', 'ENTERPRISE']).default('PRO'),
  interval: z.enum(['MONTHLY', 'YEARLY']),
})

const UpdateModulesConfigSchema = z.object({
  customBusinessTypeName: z.string().trim().min(2).max(60).optional(),
  customBusinessDescription: z.string().trim().min(2).max(200).optional(),
  enabledModules: z.array(z.string().trim().min(1)),
  featureFlags: z.record(z.string(), z.boolean()),
})

const UpdateGstBillingSchema = z.object({
  gstBilling: z.boolean(),
})

const SubscriptionCheckoutVerifySchema = z.object({
  transactionId: z.string().min(1),
  interval: z.enum(['MONTHLY', 'YEARLY']),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
})

const CancelSubscriptionSchema = z.object({
  reason: z.string().trim().min(3).max(200).optional(),
})

function stateCodeFromGstin(gstin?: string | null) {
  const trimmed = String(gstin ?? '').trim()
  const match = trimmed.match(/^(\d{2})[A-Za-z0-9]{13}$/)
  return match ? match[1] : undefined
}

function buildSettingsAuthUser(user: {
  id: string
  name: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  businessId?: string | null
  permissions: string[]
  business?: any
  accessLocked?: boolean
  accessReason?: string
}) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    businessId: user.businessId ?? null,
    businessName: user.business?.name ?? null,
    businessCity: user.business?.city ?? null,
    businessType: user.business?.businessType ?? 'GENERAL_STORE',
    customLabels: user.business?.customLabels ?? null,
    enabledModules: user.business?.enabledModules ?? [],
    featureFlags: user.business?.featureFlags ?? {},
    defaultSettings: user.business?.defaultSettings ?? {},
    permissions: user.permissions,
    subscriptionStatus: user.business?.subscriptionStatus ?? null,
    subscriptionEndsAt: user.business?.subscriptionEndsAt?.toISOString?.() ?? null,
    subscriptionInterval: user.business?.subscriptionInterval ?? null,
    monthlySubscriptionAmount: Number(user.business?.monthlySubscriptionAmount ?? 0),
    yearlySubscriptionAmount: Number(user.business?.yearlySubscriptionAmount ?? 0),
    trialStartedAt: user.business?.trialStartedAt?.toISOString?.() ?? null,
    trialDaysOverride: user.business?.trialDaysOverride ?? null,
    accessLocked: Boolean(user.accessLocked),
    accessReason: user.accessReason ?? null,
  }
}

function maskPaymentMethod(paymentMethod: any) {
  if (!paymentMethod) return null
  return {
    id: paymentMethod.id,
    provider: paymentMethod.provider,
    brand: paymentMethod.brand,
    last4: paymentMethod.last4,
    expMonth: paymentMethod.expMonth,
    expYear: paymentMethod.expYear,
    cardholderName: paymentMethod.cardholderName,
    isDefault: paymentMethod.isDefault,
    createdAt: paymentMethod.createdAt,
  }
}

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || ''
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || ''
  return {
    enabled: Boolean(keyId && keySecret),
    keyId,
    keySecret,
  }
}

function shouldAutoActivateOnVerifyInTest() {
  const value = String(process.env.RAZORPAY_TEST_AUTO_ACTIVATE ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/bootstrap', async (req, reply) => {
    const routeStart = Date.now()
    const bizId = getBizId(req)
    const userId = (req.user as { id: string }).id
    const isOwner = (req.user as { role?: string }).role === 'OWNER'
    const cacheKey = `${bizId}:${userId}:bootstrap`
    const now = Date.now()
    const cached = settingsBootstrapCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      req.log.info({ route: '/api/settings/bootstrap', bizId, userId, cache: 'hit', totalMs: Date.now() - routeStart }, 'settings bootstrap cache hit')
      return { success: true, data: cached.value }
    }

    const inFlight = settingsBootstrapInFlight.get(cacheKey)
    if (inFlight) {
      const data = await inFlight
      req.log.info({ route: '/api/settings/bootstrap', bizId, userId, cache: 'dedupe-hit', totalMs: Date.now() - routeStart }, 'settings bootstrap in-flight dedupe hit')
      return { success: true, data }
    }

    const compute = (async () => {
      const dbStart = Date.now()
      const [platform, business, authUser, paymentMethod, plans, subscriptionCtx, timeline] = await Promise.all([
        ensurePlatformSettings(),
        settingsRepository.getSettingsBusinessById(bizId),
        settingsRepository.getSettingsUserById(userId),
        settingsRepository.getDefaultPaymentMethodByBusiness(bizId),
        isOwner ? subscriptionsRepository.listActivePlans() : Promise.resolve([]),
        getSubscriptionAccessContext(bizId),
        subscriptionsRepository.listSubscriptionPaymentTimelineByBusiness(bizId),
      ])
      const dbMs = Date.now() - dbStart

      if (!business || !authUser) return null

      const accessBusiness: BusinessWithBilling = {
        id: business.id,
        name: business.name,
        subscriptionStatus: business.subscriptionStatus,
        subscriptionEndsAt: business.subscriptionEndsAt,
        trialStartedAt: business.trialStartedAt,
        trialDaysOverride: business.trialDaysOverride,
        subscriptionInterval: business.subscriptionInterval,
        monthlySubscriptionAmount: business.monthlySubscriptionAmount,
        yearlySubscriptionAmount: business.yearlySubscriptionAmount,
        isActive: business.isActive,
        suspendedReason: business.suspendedReason,
      }
      const access = computeBusinessAccess(accessBusiness, platform)

      const payload = {
        settings: {
          business,
          user: authUser,
          platformBilling: {
            trialDays: platform.trialDays,
            monthlyPrice: Number(platform.monthlyPrice),
            yearlyPrice: Number(platform.yearlyPrice),
            currency: platform.currency,
            trialRequiresCard: platform.trialRequiresCard,
          },
          subscription: {
            status: access.effectiveStatus,
            accessLocked: access.accessLocked,
            accessReason: access.reason,
            endsAt: access.endsAtIso,
            daysRemaining: access.daysRemaining,
            interval: access.subscriptionInterval,
            inTrial: access.inTrial,
            monthlyPrice: access.pricing.monthlyPrice,
            yearlyPrice: access.pricing.yearlyPrice,
            paymentMethod: maskPaymentMethod(paymentMethod),
          },
        },
        plans,
        subscriptionUsage: {
          subscription: subscriptionCtx.subscription
            ? {
                id: subscriptionCtx.subscription.id,
                status: subscriptionCtx.subscription.status,
                startDate: subscriptionCtx.subscription.startDate,
                endDate: subscriptionCtx.subscription.endDate,
                trialEndDate: subscriptionCtx.subscription.trialEndDate,
                autoRenew: subscriptionCtx.subscription.autoRenew,
                plan: {
                  id: subscriptionCtx.subscription.planId,
                  name: subscriptionCtx.subscription.planName,
                  priceMonthly: subscriptionCtx.subscription.priceMonthly,
                  priceYearly: subscriptionCtx.subscription.priceYearly,
                  features: subscriptionCtx.subscription.planFeatures,
                  limits: subscriptionCtx.subscription.limits,
                },
              }
            : null,
          usage: subscriptionCtx.usage,
          paymentTimeline: timeline.map((entry) => ({
            ...entry,
            queuedStartAt: entry.queuedStartAt?.toISOString?.() ?? null,
            queuedEndAt: entry.queuedEndAt?.toISOString?.() ?? null,
            plannedStartAt: entry.plannedStartAt?.toISOString?.() ?? null,
            plannedEndAt: entry.plannedEndAt?.toISOString?.() ?? null,
          })),
        },
        counts: null,
      }
      settingsBootstrapCache.set(cacheKey, { expiresAt: Date.now() + SETTINGS_BOOTSTRAP_CACHE_TTL_MS, value: payload })
      req.log.info({ route: '/api/settings/bootstrap', bizId, userId, cache: 'miss', dbMs, totalMs: Date.now() - routeStart }, 'settings bootstrap payload built')
      return payload
    })().finally(() => settingsBootstrapInFlight.delete(cacheKey))

    settingsBootstrapInFlight.set(cacheKey, compute)
    const data = await compute
    if (!data) return reply.status(404).send({ success: false, error: 'Workspace not found' })
    return { success: true, data }
  })

  app.get('/', async (req) => {
    const routeStart = Date.now()
    const bizId = getBizId(req)
    const userId = (req.user as { id: string }).id
    const cacheKey = `${bizId}:${userId}:settings`
    const now = Date.now()
    const cached = settingsCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }

    const inFlight = settingsInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = (async () => {
      const dbStart = Date.now()
      const [platform, business, user, paymentMethod] = await Promise.all([
        ensurePlatformSettings(),
        settingsRepository.getSettingsBusinessById(bizId),
        settingsRepository.getSettingsUserById(userId),
        settingsRepository.getDefaultPaymentMethodByBusiness(bizId),
      ])
      const dbMs = Date.now() - dbStart

      if (!business || !user) return null

      const accessBusiness: BusinessWithBilling = {
        id: business.id,
        name: business.name,
        subscriptionStatus: business.subscriptionStatus,
        subscriptionEndsAt: business.subscriptionEndsAt,
        trialStartedAt: business.trialStartedAt,
        trialDaysOverride: business.trialDaysOverride,
        subscriptionInterval: business.subscriptionInterval,
        monthlySubscriptionAmount: business.monthlySubscriptionAmount,
        yearlySubscriptionAmount: business.yearlySubscriptionAmount,
        isActive: business.isActive,
        suspendedReason: business.suspendedReason,
      }
      const access = computeBusinessAccess(accessBusiness, platform)

      const payload = {
        business,
        user,
        platformBilling: {
          trialDays: platform.trialDays,
          monthlyPrice: Number(platform.monthlyPrice),
          yearlyPrice: Number(platform.yearlyPrice),
          currency: platform.currency,
          trialRequiresCard: platform.trialRequiresCard,
        },
        subscription: {
          status: access.effectiveStatus,
          accessLocked: access.accessLocked,
          accessReason: access.reason,
          endsAt: access.endsAtIso,
          daysRemaining: access.daysRemaining,
          interval: access.subscriptionInterval,
          inTrial: access.inTrial,
          monthlyPrice: access.pricing.monthlyPrice,
          yearlyPrice: access.pricing.yearlyPrice,
          paymentMethod: maskPaymentMethod(paymentMethod),
        },
      }
      req.log.info({ route: '/api/settings', bizId, userId, dbMs, totalMs: Date.now() - routeStart }, 'settings payload built')
      return payload
    })().finally(() => settingsInFlight.delete(cacheKey))

    settingsInFlight.set(cacheKey, compute)
    const data = await compute
    if (!data) return { success: false, error: 'Workspace not found' }
    settingsCache.set(cacheKey, { expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  app.get('/subscription', async (req, reply) => {
    const routeStart = Date.now()
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const cacheKey = `${bizId}:subscription`
    const now = Date.now()
    const cached = settingsSubscriptionCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }
    const inFlight = settingsSubscriptionInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = (async () => {
      const dbStart = Date.now()
      const [platform, business, paymentMethod, transactions, subscriptionCtx] = await Promise.all([
        ensurePlatformSettings(),
        settingsRepository.getSettingsBusinessById(bizId),
        settingsRepository.getDefaultPaymentMethodByBusiness(bizId),
        settingsRepository.getRecentPaymentTransactionsByBusiness(bizId, 8),
        getSubscriptionAccessContext(bizId),
      ])
      const dbMs = Date.now() - dbStart

      if (!business) return null

      const accessBusiness: BusinessWithBilling = {
        id: business.id,
        name: business.name,
        subscriptionStatus: business.subscriptionStatus,
        subscriptionEndsAt: business.subscriptionEndsAt,
        trialStartedAt: business.trialStartedAt,
        trialDaysOverride: business.trialDaysOverride,
        subscriptionInterval: business.subscriptionInterval,
        monthlySubscriptionAmount: business.monthlySubscriptionAmount,
        yearlySubscriptionAmount: business.yearlySubscriptionAmount,
        isActive: business.isActive,
        suspendedReason: business.suspendedReason,
      }
      const access = computeBusinessAccess(accessBusiness, platform)

      const payload = {
        status: access.effectiveStatus,
        accessLocked: access.accessLocked,
        accessReason: access.reason,
        endsAt: access.endsAtIso,
        daysRemaining: access.daysRemaining,
        interval: access.subscriptionInterval,
        inTrial: access.inTrial,
        paymentMethod: maskPaymentMethod(paymentMethod),
        plans: [
          { interval: 'MONTHLY', label: 'Monthly', amount: access.pricing.monthlyPrice, currency: platform.currency },
          { interval: 'YEARLY', label: 'Yearly', amount: access.pricing.yearlyPrice, currency: platform.currency },
        ],
        recentPayments: transactions.map((transaction: settingsRepository.SettingsPaymentTransactionRow) => ({
          id: transaction.id,
          interval: transaction.interval,
          amount: Number(transaction.amount),
          currency: transaction.currency,
          status: transaction.status,
          createdAt: transaction.createdAt,
          paidAt: transaction.paidAt,
          reference: transaction.reference,
          failureReason: transaction.failureReason,
        })),
        planV2: subscriptionCtx.subscription
          ? {
              name: subscriptionCtx.subscription.planName,
              status: subscriptionCtx.subscription.status,
              startDate: subscriptionCtx.subscription.startDate,
              endDate: subscriptionCtx.subscription.endDate,
              trialEndDate: subscriptionCtx.subscription.trialEndDate,
              limits: subscriptionCtx.subscription.limits,
            }
          : null,
        usageV2: subscriptionCtx.usage,
      }
      req.log.info({ route: '/api/settings/subscription', bizId, dbMs, totalMs: Date.now() - routeStart }, 'subscription payload built')
      return payload
    })().finally(() => settingsSubscriptionInFlight.delete(cacheKey))

    settingsSubscriptionInFlight.set(cacheKey, compute)
    const data = await compute
    if (!data) return reply.status(404).send({ success: false, error: 'Business not found' })
    settingsSubscriptionCache.set(cacheKey, { expiresAt: Date.now() + SETTINGS_SUBSCRIPTION_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  app.get('/plans', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const plans = await subscriptionsRepository.listActivePlans()
    return { success: true, data: plans }
  })

  app.get('/subscription/usage', async (req, reply) => {
    const routeStart = Date.now()
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const cacheKey = `${bizId}:subscription-usage`
    const now = Date.now()
    const cached = settingsSubscriptionUsageCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      req.log.info({ route: '/api/settings/subscription/usage', bizId, cache: 'hit', totalMs: Date.now() - routeStart }, 'subscription usage cache hit')
      return { success: true, data: cached.value }
    }
    const inFlight = settingsSubscriptionUsageInFlight.get(cacheKey)
    if (inFlight) {
      const data = await inFlight
      req.log.info({ route: '/api/settings/subscription/usage', bizId, cache: 'dedupe-hit', totalMs: Date.now() - routeStart }, 'subscription usage in-flight dedupe hit')
      return { success: true, data }
    }
    const compute = (async () => {
      const dbStart = Date.now()
      const [{ subscription, usage }, timeline] = await Promise.all([
        getSubscriptionAccessContext(bizId),
        subscriptionsRepository.listSubscriptionPaymentTimelineByBusiness(bizId),
      ])
      const dbMs = Date.now() - dbStart
      const payload = {
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              trialEndDate: subscription.trialEndDate,
              autoRenew: subscription.autoRenew,
              plan: {
                id: subscription.planId,
                name: subscription.planName,
                priceMonthly: subscription.priceMonthly,
                priceYearly: subscription.priceYearly,
                features: subscription.planFeatures,
                limits: subscription.limits,
              },
            }
          : null,
        usage,
        paymentTimeline: timeline.map((entry) => ({
          ...entry,
          queuedStartAt: entry.queuedStartAt?.toISOString?.() ?? null,
          queuedEndAt: entry.queuedEndAt?.toISOString?.() ?? null,
          plannedStartAt: entry.plannedStartAt?.toISOString?.() ?? null,
          plannedEndAt: entry.plannedEndAt?.toISOString?.() ?? null,
        })),
      }
      settingsSubscriptionUsageCache.set(cacheKey, { expiresAt: Date.now() + SETTINGS_SUBSCRIPTION_USAGE_CACHE_TTL_MS, value: payload })
      req.log.info({ route: '/api/settings/subscription/usage', bizId, cache: 'miss', dbMs, totalMs: Date.now() - routeStart }, 'subscription usage payload built')
      return payload
    })().finally(() => settingsSubscriptionUsageInFlight.delete(cacheKey))
    settingsSubscriptionUsageInFlight.set(cacheKey, compute)
    const data = await compute
    return { success: true, data }
  })

  app.post('/subscription/checkout/initiate', async (req, reply) => {
    const routeStart = Date.now()
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = SubscriptionCheckoutInitiateSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid subscription input' })

    const platform = await ensurePlatformSettings()
    const razorpay = getRazorpayConfig()
    if (!razorpay.enabled) {
      return reply.status(400).send({
        success: false,
        error: 'Razorpay test keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in API .env.',
      })
    }

    const business = await settingsRepository.getSettingsBusinessById(bizId)
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })

    const paymentMethod = await settingsRepository.getDefaultPaymentMethodByBusiness(bizId)

    const plan = await subscriptionsRepository.getPlanByName(body.data.planName)
    if (!plan) return reply.status(400).send({ success: false, error: 'Selected plan is not active' })

    const pending = await subscriptionsRepository.getLatestPendingSubscriptionPaymentByBusiness(bizId)
    if (pending) {
      const pendingAgeMs = Date.now() - new Date(pending.createdAt).getTime()
      const pendingLockMs = 20 * 60 * 1000
      if (Number.isFinite(pendingAgeMs) && pendingAgeMs <= pendingLockMs) {
        const pendingWindow =
          pending.plannedStartAt && pending.plannedEndAt
            ? ` Planned window: ${pending.plannedStartAt.toISOString()} to ${pending.plannedEndAt.toISOString()}.`
            : ''
        return reply.status(409).send({
          success: false,
          error: `A subscription payment is already being processed. Please wait for confirmation before starting another checkout.${pendingWindow}`,
          data: {
            code: 'PAYMENT_PENDING',
            pendingOrderId: pending.razorpayOrderId,
            pendingInterval: pending.interval,
            pendingCreatedAt: pending.createdAt.toISOString(),
            pendingPlannedStartAt: pending.plannedStartAt?.toISOString?.() ?? null,
            pendingPlannedEndAt: pending.plannedEndAt?.toISOString?.() ?? null,
          },
        })
      }
    }

    const amount = body.data.interval === 'YEARLY' ? Number(plan.priceYearly) : Number(plan.priceMonthly)
    const amountInPaise = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      return reply.status(400).send({ success: false, error: 'Invalid payment amount' })
    }

    const receipt = `sub_${bizId.slice(0, 10)}_${Date.now()}`
    const externalStart = Date.now()
    const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${razorpay.keyId}:${razorpay.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: platform.currency || 'INR',
        receipt,
        notes: {
          businessId: bizId,
          interval: body.data.interval,
          planName: body.data.planName,
        },
      }),
    })

    const orderPayload: any = await orderResponse.json().catch(() => ({}))
    const externalMs = Date.now() - externalStart
    if (!orderResponse.ok || !orderPayload?.id) {
      return reply.status(502).send({
        success: false,
        error: orderPayload?.error?.description ?? 'Unable to create Razorpay order. Try again.',
      })
    }

    const now = new Date()
    const plannedStartAt = await subscriptionsRepository.getNextSubscriptionWindowStart(bizId, now)
    const plannedEndAt = new Date(plannedStartAt)
    plannedEndAt.setDate(plannedEndAt.getDate() + (body.data.interval === 'YEARLY' ? 365 : 30))
    const queued = plannedStartAt.getTime() > now.getTime()

    const transaction = await settingsRepository.createPendingPaymentTransaction({
      businessId: bizId,
      paymentMethodId: paymentMethod?.id ?? null,
      interval: body.data.interval,
      amount,
      currency: platform.currency,
      reference: orderPayload.id,
      metadata: {
        gateway: 'RAZORPAY',
        receipt,
        razorpayOrderId: orderPayload.id,
        planName: body.data.planName,
        plannedStartAt: plannedStartAt.toISOString(),
        plannedEndAt: plannedEndAt.toISOString(),
        queued,
      },
    })
    await subscriptionsRepository.createPendingSubscriptionPayment({
      businessId: bizId,
      planId: plan.id,
      interval: body.data.interval,
      amount,
      razorpayOrderId: orderPayload.id,
      metadata: {
        transactionId: transaction.id,
        planName: body.data.planName,
        plannedStartAt: plannedStartAt.toISOString(),
        plannedEndAt: plannedEndAt.toISOString(),
        queued,
      },
    })
    req.log.info({ route: '/api/settings/subscription/checkout/initiate', bizId, externalMs, totalMs: Date.now() - routeStart }, 'checkout initiated')

    return {
      success: true,
      data: {
        mode: 'RAZORPAY',
        transactionId: transaction.id,
        amount,
        currency: platform.currency,
        interval: body.data.interval,
        planName: body.data.planName,
        razorpay: {
          keyId: razorpay.keyId,
          orderId: orderPayload.id,
          amount: amountInPaise,
          currency: platform.currency || 'INR',
          name: business.name,
          description: `${body.data.planName} ${body.data.interval === 'YEARLY' ? 'yearly' : 'monthly'} subscription`,
          prefill: {
            name: (req.user as any)?.name ?? business.name,
            contact: (req.user as any)?.phone ?? undefined,
          },
        },
      },
    }
  })

  app.post('/subscription/checkout/verify', async (req, reply) => {
    const routeStart = Date.now()
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = SubscriptionCheckoutVerifySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid payment verification payload' })

    const razorpay = getRazorpayConfig()
    if (!razorpay.enabled) {
      return reply.status(400).send({
        success: false,
        error: 'Razorpay test keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in API .env.',
      })
    }

    const expected = createHmac('sha256', razorpay.keySecret)
      .update(`${body.data.razorpayOrderId}|${body.data.razorpayPaymentId}`)
      .digest('hex')
    if (expected !== body.data.razorpaySignature) {
      await settingsRepository.markTransactionFailedForSignature({
        transactionId: body.data.transactionId,
        businessId: bizId,
        razorpayOrderId: body.data.razorpayOrderId,
        razorpayPaymentId: body.data.razorpayPaymentId,
      })
      return reply.status(400).send({ success: false, error: 'Payment verification failed. Please try again.' })
    }

    const transaction = await settingsRepository.getSubscriptionTransactionForVerification(body.data.transactionId, bizId)
    if (!transaction) return reply.status(404).send({ success: false, error: 'Pending transaction not found' })
    if (transaction.status === 'SUCCEEDED') {
      return reply.status(409).send({ success: false, error: 'Payment already verified' })
    }
    if (transaction.interval !== body.data.interval) {
      return reply.status(400).send({ success: false, error: 'Subscription interval does not match transaction' })
    }
    if (transaction.reference !== body.data.razorpayOrderId) {
      return reply.status(400).send({ success: false, error: 'Order reference mismatch' })
    }

    // In local/test mode we can simulate webhook capture from checkout verify.
    // Keep production on webhook as source of truth.
    if (shouldAutoActivateOnVerifyInTest()) {
      const syntheticEventId = `checkout-verify:${body.data.razorpayOrderId}:${body.data.razorpayPaymentId}`
      await subscriptionsRepository.processRazorpayWebhookEvent({
        eventId: syntheticEventId,
        eventType: 'payment.captured',
        razorpayOrderId: body.data.razorpayOrderId,
        razorpayPaymentId: body.data.razorpayPaymentId,
        payload: {
          source: 'checkout.verify.fallback',
          transactionId: body.data.transactionId,
          interval: body.data.interval,
        } as any,
      })

      const [settings, updatedBusiness, refreshedUser] = await Promise.all([
        ensurePlatformSettings(),
        settingsRepository.getSettingsBusinessById(bizId),
        settingsRepository.getSettingsSessionUserById((req.user as any).id),
      ])
      if (!updatedBusiness || !refreshedUser) {
        return reply.status(404).send({ success: false, error: 'Business or user not found after activation' })
      }
      const access = computeBusinessAccess(updatedBusiness, settings)
      const authUser = buildSettingsAuthUser({
        id: refreshedUser.id,
        name: refreshedUser.name,
        role: refreshedUser.role,
        businessId: refreshedUser.businessId,
        permissions: refreshedUser.permissions,
        business: refreshedUser.businessId
          ? {
              name: refreshedUser.businessName,
              city: refreshedUser.businessCity,
              businessType: refreshedUser.businessType,
              customLabels: refreshedUser.customLabels,
              enabledModules: refreshedUser.enabledModules,
              featureFlags: refreshedUser.featureFlags,
              defaultSettings: refreshedUser.defaultSettings,
              subscriptionStatus: refreshedUser.subscriptionStatus,
              subscriptionEndsAt: refreshedUser.subscriptionEndsAt,
              subscriptionInterval: refreshedUser.subscriptionInterval,
              monthlySubscriptionAmount: refreshedUser.monthlySubscriptionAmount,
              yearlySubscriptionAmount: refreshedUser.yearlySubscriptionAmount,
              trialStartedAt: refreshedUser.trialStartedAt,
              trialDaysOverride: refreshedUser.trialDaysOverride,
            }
          : undefined,
        accessLocked: access.accessLocked,
        accessReason: access.reason,
      })
      const token = app.jwt.sign(authUser, { expiresIn: '7d' })
      invalidateSettingsCaches(bizId, (req.user as any).id)
      return {
        success: true,
        data: {
          id: transaction.id,
          amount: Number(transaction.amount),
          currency: transaction.currency,
          interval: transaction.interval,
          paidAt: new Date().toISOString(),
          pendingWebhook: false,
          endsAt: access.endsAtIso,
          status: access.effectiveStatus,
          message: 'Payment verified and plan activated in test fallback mode.',
          session: {
            token,
            user: authUser,
          },
        },
      }
    }

    invalidateSettingsCaches(bizId, (req.user as any).id)
    // Source of truth is webhook capture/failure event.
    // This endpoint only confirms checkout signature from client callback.
    req.log.info({ route: '/api/settings/subscription/checkout/verify', bizId, activation: 'pending-webhook', totalMs: Date.now() - routeStart }, 'checkout verified')
    return {
      success: true,
      data: {
        id: transaction.id,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        interval: transaction.interval,
        paidAt: new Date().toISOString(),
        pendingWebhook: true,
        message: 'Payment captured at checkout. Subscription will activate after webhook confirmation.',
      },
    }
  })

  app.post('/subscription/cancel', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = CancelSubscriptionSchema.safeParse(req.body ?? {})
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid cancellation request' })

    const business = await settingsRepository.getSettingsBusinessById(bizId)
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    if (!business.subscriptionInterval) {
      return reply.status(400).send({ success: false, error: 'No paid subscription is active to cancel.' })
    }

    const updated = await settingsRepository.cancelSubscriptionByBusiness(bizId)
    if (!updated) return reply.status(404).send({ success: false, error: 'Business not found' })

    const refreshedUser = await settingsRepository.getSettingsSessionUserById((req.user as any).id)
    if (!refreshedUser) return reply.status(404).send({ success: false, error: 'User not found after cancellation' })

    const settings = await ensurePlatformSettings()
    const access = computeBusinessAccess(updated, settings)
    const authUser = buildSettingsAuthUser({
      id: refreshedUser.id,
      name: refreshedUser.name,
      role: refreshedUser.role,
      businessId: refreshedUser.businessId,
      permissions: refreshedUser.permissions,
      business: refreshedUser.businessId ? {
        name: refreshedUser.businessName,
        city: refreshedUser.businessCity,
        businessType: refreshedUser.businessType,
        customLabels: refreshedUser.customLabels,
        subscriptionStatus: refreshedUser.subscriptionStatus,
        subscriptionEndsAt: refreshedUser.subscriptionEndsAt,
        subscriptionInterval: refreshedUser.subscriptionInterval,
        monthlySubscriptionAmount: refreshedUser.monthlySubscriptionAmount,
        yearlySubscriptionAmount: refreshedUser.yearlySubscriptionAmount,
        trialStartedAt: refreshedUser.trialStartedAt,
        trialDaysOverride: refreshedUser.trialDaysOverride,
      } : undefined,
      accessLocked: access.accessLocked,
      accessReason: access.reason,
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })
    invalidateSettingsCaches(bizId, (req.user as any).id)

    return {
      success: true,
      data: {
        status: updated.subscriptionStatus,
        interval: updated.subscriptionInterval,
        endsAt: updated.subscriptionEndsAt?.toISOString?.() ?? null,
        message: updated.subscriptionEndsAt
          ? `Subscription cancelled. Current access remains available until ${updated.subscriptionEndsAt.toISOString()}.`
          : 'Subscription cancelled successfully.',
        cancellationReason: body.data.reason ?? null,
        session: {
          token,
          user: authUser,
        },
      },
    }
  })

  app.patch('/business', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = UpdateBusinessSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const business = await settingsRepository.updateBusinessProfile(bizId, {
      ...body.data,
      stateCode: body.data.stateCode ?? stateCodeFromGstin(body.data.gstin),
    })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    invalidateSettingsCaches(bizId, (req.user as any).id)

    return { success: true, data: business }
  })

  app.patch('/business/gst-billing', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = UpdateGstBillingSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const current = await settingsRepository.getSettingsBusinessById(bizId)
    if (!current) return reply.status(404).send({ success: false, error: 'Business not found' })

    const enabledModules = Array.isArray(current.enabledModules) ? current.enabledModules : []
    if (body.data.gstBilling && !enabledModules.includes('orders')) {
      return reply.status(400).send({ success: false, error: 'GST billing requires billing/orders module.' })
    }

    const currentFlags =
      current.featureFlags && typeof current.featureFlags === 'object'
        ? current.featureFlags
        : {}
    const business = await settingsRepository.updateBusinessProfile(bizId, {
      featureFlags: {
        ...(currentFlags as Record<string, boolean>),
        gstBilling: body.data.gstBilling,
      },
    })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    invalidateSettingsCaches(bizId, (req.user as any).id)

    return { success: true, data: business }
  })

  app.patch('/business/modules-config', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = UpdateModulesConfigSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const current = await settingsRepository.getSettingsBusinessById(bizId)
    if (!current) return reply.status(404).send({ success: false, error: 'Business not found' })
    const normalizedType = normalizeBusinessType(current.businessType)
    if (normalizedType !== 'CUSTOM') {
      return reply.status(400).send({ success: false, error: 'Modules can be edited only for CUSTOM business type' })
    }

    const enabledModules = normalizeCustomModules(body.data.enabledModules)
    const featureFlags = normalizeCustomFeatureFlags(body.data.featureFlags)
    const errors = validateCustomBusinessSelection({ enabledModules, featureFlags })
    if (errors.length > 0) return reply.status(400).send({ success: false, error: errors[0] })

    const currentSettings =
      current.defaultSettings && typeof current.defaultSettings === 'object'
        ? current.defaultSettings
        : {}
    const defaultSettings = {
      ...(currentSettings as Record<string, unknown>),
      customBusinessDescription: body.data.customBusinessDescription?.trim() ?? null,
      userConfigurableModules: true,
    }
    const currentLabels =
      current.customLabels && typeof current.customLabels === 'object'
        ? current.customLabels
        : {}
    const customLabels = {
      ...(currentLabels as Record<string, string>),
      ...(body.data.customBusinessTypeName?.trim()
        ? { businessTypeName: body.data.customBusinessTypeName.trim() }
        : {}),
    }

    const business = await settingsRepository.updateBusinessProfile(bizId, {
      enabledModules,
      featureFlags,
      defaultSettings,
      customLabels,
    })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    invalidateSettingsCaches(bizId, (req.user as any).id)
    return { success: true, data: business }
  })

  app.patch('/reminders', async (req, reply) => {
    const bizId = getBizId(req)
    const body = UpdateReminderRulesSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const business = await settingsRepository.updateBusinessReminders(bizId, body.data)
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    invalidateSettingsCaches(bizId, (req.user as any).id)

    return { success: true, data: business }
  })

  app.patch('/profile', async (req, reply) => {
    const userId = (req.user as any).id
    const body = UpdateProfileSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    if (body.data.phone) {
      const existing = await settingsRepository.findUserByPhone(body.data.phone)
      if (existing && existing.id !== userId) {
        return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })
      }
    }
    if (body.data.email) {
      const existingEmail = await settingsRepository.findUserByEmail(body.data.email)
      if (existingEmail && existingEmail.id !== userId) {
        return reply.status(409).send({ success: false, error: 'A user with this email already exists' })
      }
    }

    const user = await settingsRepository.updateUserProfile(userId, body.data)
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })
    invalidateSettingsCaches(getBizId(req), userId)

    return { success: true, data: user }
  })

  app.post('/change-password', async (req, reply) => {
    const userId = (req.user as any).id
    const body = ChangePasswordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const user = await settingsRepository.getUserPasswordById(userId)
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Current password is incorrect' })

    const passwordHash = await bcrypt.hash(body.data.newPassword, 10)
    await settingsRepository.updateUserPassword(userId, passwordHash)
    invalidateSettingsCaches(getBizId(req), userId)

    return { success: true }
  })

  app.get('/staff', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const cacheKey = `${bizId}:staff`
    const now = Date.now()
    const cached = settingsStaffCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }
    const inFlight = settingsStaffInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = settingsRepository
      .getStaffByBusiness(bizId)
      .finally(() => settingsStaffInFlight.delete(cacheKey))
    settingsStaffInFlight.set(cacheKey, compute)
    const staff = await compute
    settingsStaffCache.set(cacheKey, { expiresAt: Date.now() + SETTINGS_STAFF_CACHE_TTL_MS, value: staff })
    return { success: true, data: staff }
  })

  app.post('/staff', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = CreateStaffSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    try {
      await ensureUsageAllowed(bizId, 'users')
    } catch (error: any) {
      if (error.message === 'PLAN_EXPIRED') {
        return reply.status(402).send({ success: false, code: 'PLAN_EXPIRED', error: 'Plan expired. Please renew your subscription.' })
      }
      if (error.message === 'LIMIT_EXCEEDED') {
        return reply.status(403).send({ success: false, code: 'LIMIT_EXCEEDED', error: 'Staff user limit reached for your plan.' })
      }
      throw error
    }

    const existing = await settingsRepository.findUserByPhone(body.data.phone)
    if (existing) return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })

    if (body.data.email) {
      const existingEmail = await settingsRepository.findUserByEmail(body.data.email)
      if (existingEmail) return reply.status(409).send({ success: false, error: 'A user with this email already exists' })
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const staff = await settingsRepository.createStaff({
      businessId: bizId,
      name: body.data.name,
      phone: body.data.phone,
      email: body.data.email,
      passwordHash,
      permissions: body.data.permissions,
    })
    invalidateSettingsCaches(bizId, (req.user as any).id)
    return { success: true, data: staff }
  })

  app.patch('/staff/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const { id } = req.params as any
    const body = UpdateStaffSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    if (body.data.phone) {
      const existing = await settingsRepository.findUserByPhone(body.data.phone)
      if (existing && existing.id !== id) {
        return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })
      }
    }
    if (body.data.email) {
      const existingEmail = await settingsRepository.findUserByEmail(body.data.email)
      if (existingEmail && existingEmail.id !== id) {
        return reply.status(409).send({ success: false, error: 'A user with this email already exists' })
      }
    }

    const staff = await settingsRepository.updateStaff(id, bizId, body.data)
    if (!staff) return reply.status(404).send({ success: false, error: 'Staff member not found' })
    invalidateSettingsCaches(bizId, (req.user as any).id)
    return { success: true, data: staff }
  })

  app.delete('/staff/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const { id } = req.params as any
    await settingsRepository.deactivateStaff(id, bizId)
    invalidateSettingsCaches(bizId, (req.user as any).id)
    return { success: true }
  })
}
