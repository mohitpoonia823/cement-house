import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createHmac } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { settingsRepository } from '@cement-house/db'
import { getBizId, requireOwner } from '../../middleware/auth'
import {
  type BusinessWithBilling,
  computeSubscriptionAmount,
  computeBusinessAccess,
  ensurePlatformSettings,
} from '../../services/billing'

const SETTINGS_CACHE_TTL_MS = 10_000
const SETTINGS_SUBSCRIPTION_CACHE_TTL_MS = 10_000
const SETTINGS_STAFF_CACHE_TTL_MS = 10_000
const settingsCache = new Map<string, { expiresAt: number; value: any }>()
const settingsInFlight = new Map<string, Promise<any>>()
const settingsSubscriptionCache = new Map<string, { expiresAt: number; value: any }>()
const settingsSubscriptionInFlight = new Map<string, Promise<any>>()
const settingsStaffCache = new Map<string, { expiresAt: number; value: any }>()
const settingsStaffInFlight = new Map<string, Promise<any>>()

function clearSettingsCacheByPrefix(prefix: string) {
  for (const key of settingsCache.keys()) if (key.startsWith(prefix)) settingsCache.delete(key)
  for (const key of settingsInFlight.keys()) if (key.startsWith(prefix)) settingsInFlight.delete(key)
  for (const key of settingsSubscriptionCache.keys()) if (key.startsWith(prefix)) settingsSubscriptionCache.delete(key)
  for (const key of settingsSubscriptionInFlight.keys()) if (key.startsWith(prefix)) settingsSubscriptionInFlight.delete(key)
  for (const key of settingsStaffCache.keys()) if (key.startsWith(prefix)) settingsStaffCache.delete(key)
  for (const key of settingsStaffInFlight.keys()) if (key.startsWith(prefix)) settingsStaffInFlight.delete(key)
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
  interval: z.enum(['MONTHLY', 'YEARLY']),
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

function getNewSubscriptionEndDate(interval: 'MONTHLY' | 'YEARLY', fromDate?: Date | null) {
  const now = new Date()
  const base = fromDate && fromDate.getTime() > now.getTime() ? new Date(fromDate) : now
  const next = new Date(base)
  next.setDate(next.getDate() + (interval === 'YEARLY' ? 365 : 30))
  return next
}

function isActivePaidCycle(business: { subscriptionEndsAt: Date | null; subscriptionInterval: 'MONTHLY' | 'YEARLY' | null }) {
  if (!business.subscriptionInterval || !business.subscriptionEndsAt) return false
  return new Date(business.subscriptionEndsAt).getTime() > Date.now()
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const bizId = getBizId(req)
    const userId = (req.user as { id: string }).id
    const cacheKey = `${bizId}:${userId}:settings`
    const now = Date.now()
    const cached = settingsCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }

    const inFlight = settingsInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = (async () => {
      const [platform, business, user, paymentMethod] = await Promise.all([
        ensurePlatformSettings(),
        settingsRepository.getSettingsBusinessById(bizId),
        settingsRepository.getSettingsUserById(userId),
        settingsRepository.getDefaultPaymentMethodByBusiness(bizId),
      ])

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

      return {
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
    })().finally(() => settingsInFlight.delete(cacheKey))

    settingsInFlight.set(cacheKey, compute)
    const data = await compute
    if (!data) return { success: false, error: 'Workspace not found' }
    settingsCache.set(cacheKey, { expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  app.get('/subscription', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const cacheKey = `${bizId}:subscription`
    const now = Date.now()
    const cached = settingsSubscriptionCache.get(cacheKey)
    if (cached && cached.expiresAt > now) return { success: true, data: cached.value }
    const inFlight = settingsSubscriptionInFlight.get(cacheKey)
    if (inFlight) return { success: true, data: await inFlight }

    const compute = (async () => {
      const [platform, business, paymentMethod, transactions] = await Promise.all([
        ensurePlatformSettings(),
        settingsRepository.getSettingsBusinessById(bizId),
        settingsRepository.getDefaultPaymentMethodByBusiness(bizId),
        settingsRepository.getRecentPaymentTransactionsByBusiness(bizId, 8),
      ])

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

      return {
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
      }
    })().finally(() => settingsSubscriptionInFlight.delete(cacheKey))

    settingsSubscriptionInFlight.set(cacheKey, compute)
    const data = await compute
    if (!data) return reply.status(404).send({ success: false, error: 'Business not found' })
    settingsSubscriptionCache.set(cacheKey, { expiresAt: Date.now() + SETTINGS_SUBSCRIPTION_CACHE_TTL_MS, value: data })
    return { success: true, data }
  })

  app.post('/subscription/checkout/initiate', async (req, reply) => {
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
    const hasActiveCycle = isActivePaidCycle(business)
    if (hasActiveCycle && business.subscriptionInterval === 'YEARLY' && body.data.interval === 'MONTHLY') {
      const activeUntil = business.subscriptionEndsAt?.toISOString?.() ?? 'the current yearly end date'
      return reply.status(409).send({
        success: false,
        error: `Yearly plan is already active until ${activeUntil}. Monthly downgrade is available only after the yearly cycle ends.`,
      })
    }

    const paymentMethod = await settingsRepository.getDefaultPaymentMethodByBusiness(bizId)

    const amount = computeSubscriptionAmount(business, platform, body.data.interval)
    const amountInPaise = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      return reply.status(400).send({ success: false, error: 'Invalid payment amount' })
    }

    const receipt = `sub_${bizId.slice(0, 10)}_${Date.now()}`
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
        },
      }),
    })

    const orderPayload: any = await orderResponse.json().catch(() => ({}))
    if (!orderResponse.ok || !orderPayload?.id) {
      return reply.status(502).send({
        success: false,
        error: orderPayload?.error?.description ?? 'Unable to create Razorpay order. Try again.',
      })
    }

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
      },
    })

    return {
      success: true,
      data: {
        mode: 'RAZORPAY',
        transactionId: transaction.id,
        amount,
        currency: platform.currency,
        interval: body.data.interval,
        razorpay: {
          keyId: razorpay.keyId,
          orderId: orderPayload.id,
          amount: amountInPaise,
          currency: platform.currency || 'INR',
          name: business.name,
          description: `${body.data.interval === 'YEARLY' ? 'Yearly' : 'Monthly'} subscription`,
          prefill: {
            name: (req.user as any)?.name ?? business.name,
            contact: (req.user as any)?.phone ?? undefined,
          },
        },
      },
    }
  })

  app.post('/subscription/checkout/verify', async (req, reply) => {
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

    const hasActiveCycle = isActivePaidCycle({
      subscriptionEndsAt: transaction.businessSubscriptionEndsAt,
      subscriptionInterval: transaction.businessSubscriptionInterval,
    })
    if (hasActiveCycle && transaction.businessSubscriptionInterval === 'YEARLY' && body.data.interval === 'MONTHLY') {
      return reply.status(409).send({
        success: false,
        error: 'Monthly downgrade is blocked while a yearly subscription cycle is active.',
      })
    }

    const baseDateForRenewal = hasActiveCycle ? transaction.businessSubscriptionEndsAt : null
    const newEndDate = getNewSubscriptionEndDate(body.data.interval, baseDateForRenewal)
    await settingsRepository.finalizeSubscriptionPayment({
      transactionId: transaction.id,
      businessId: bizId,
        interval: body.data.interval,
      razorpayOrderId: body.data.razorpayOrderId,
      razorpayPaymentId: body.data.razorpayPaymentId,
      newEndDate,
    })

    const refreshedUser = await settingsRepository.getSettingsSessionUserById((req.user as any).id)
    if (!refreshedUser) return reply.status(404).send({ success: false, error: 'User not found after payment verification' })

    const authUser = buildSettingsAuthUser({
      id: refreshedUser.id,
      name: refreshedUser.name,
      role: refreshedUser.role,
      businessId: refreshedUser.businessId,
      permissions: refreshedUser.permissions,
      business: refreshedUser.businessId ? {
        name: refreshedUser.businessName,
        city: refreshedUser.businessCity,
        subscriptionStatus: refreshedUser.subscriptionStatus,
        subscriptionEndsAt: refreshedUser.subscriptionEndsAt,
        subscriptionInterval: refreshedUser.subscriptionInterval,
        monthlySubscriptionAmount: refreshedUser.monthlySubscriptionAmount,
        yearlySubscriptionAmount: refreshedUser.yearlySubscriptionAmount,
        trialStartedAt: refreshedUser.trialStartedAt,
        trialDaysOverride: refreshedUser.trialDaysOverride,
      } : undefined,
      accessLocked: false,
      accessReason: '',
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
        endsAt: newEndDate.toISOString(),
        session: {
          token,
          user: authUser,
        },
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

    const business = await settingsRepository.updateBusinessProfile(bizId, body.data)
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
