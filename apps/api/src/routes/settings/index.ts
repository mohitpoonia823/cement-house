import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createHmac } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { prisma } from '@cement-house/db'
import { getBizId, requireOwner } from '../../middleware/auth'
import {
  computeSubscriptionAmount,
  computeBusinessAccess,
  ensurePlatformSettings,
  getDefaultPaymentMethod,
} from '../../services/billing'

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
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
})

const CreateStaffSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(10),
  password: z.string().min(6),
  permissions: z.array(z.string()).default([]),
})

const UpdateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(10).max(10).optional(),
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
    const userId = (req.user as any).id

    const [platform, business, user, paymentMethod] = await Promise.all([
      ensurePlatformSettings(),
      prisma.business.findUnique({ where: { id: bizId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, phone: true, role: true } }),
      getDefaultPaymentMethod(prisma, bizId),
    ])

    if (!business || !user) {
      return { success: false, error: 'Workspace not found' }
    }

    const access = computeBusinessAccess(business, platform)

    return {
      success: true,
      data: {
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
      },
    }
  })

  app.get('/subscription', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)

    const [platform, business, paymentMethod, transactions] = await Promise.all([
      ensurePlatformSettings(),
      prisma.business.findUnique({ where: { id: bizId } }),
      getDefaultPaymentMethod(prisma, bizId),
      prisma.paymentTransaction.findMany({
        where: { businessId: bizId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ])

    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })

    const access = computeBusinessAccess(business, platform)

    return {
      success: true,
      data: {
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
        recentPayments: transactions.map((transaction) => ({
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
      },
    }
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

    const business = await prisma.business.findUnique({ where: { id: bizId } })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    const hasActiveCycle = isActivePaidCycle(business)
    if (hasActiveCycle && business.subscriptionInterval === 'YEARLY' && body.data.interval === 'MONTHLY') {
      const activeUntil = business.subscriptionEndsAt?.toISOString?.() ?? 'the current yearly end date'
      return reply.status(409).send({
        success: false,
        error: `Yearly plan is already active until ${activeUntil}. Monthly downgrade is available only after the yearly cycle ends.`,
      })
    }

    const paymentMethod = await getDefaultPaymentMethod(prisma, bizId)

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

    const transaction = await prisma.paymentTransaction.create({
      data: {
        businessId: bizId,
        paymentMethodId: paymentMethod?.id ?? null,
        provider: 'DUMMY',
        interval: body.data.interval,
        amount,
        currency: platform.currency,
        status: 'PENDING',
        reference: orderPayload.id,
        metadata: {
          gateway: 'RAZORPAY',
          receipt,
          razorpayOrderId: orderPayload.id,
        },
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
      await prisma.paymentTransaction.updateMany({
        where: { id: body.data.transactionId, businessId: bizId, status: 'PENDING' },
        data: {
          status: 'FAILED',
          failureReason: 'Signature verification failed',
          metadata: {
            gateway: 'RAZORPAY',
            razorpayOrderId: body.data.razorpayOrderId,
            razorpayPaymentId: body.data.razorpayPaymentId,
          },
        },
      })
      return reply.status(400).send({ success: false, error: 'Payment verification failed. Please try again.' })
    }

    const transaction = await prisma.paymentTransaction.findFirst({
      where: { id: body.data.transactionId, businessId: bizId },
      include: { business: true },
    })
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

    const hasActiveCycle = isActivePaidCycle(transaction.business)
    if (hasActiveCycle && transaction.business.subscriptionInterval === 'YEARLY' && body.data.interval === 'MONTHLY') {
      return reply.status(409).send({
        success: false,
        error: 'Monthly downgrade is blocked while a yearly subscription cycle is active.',
      })
    }

    const baseDateForRenewal = hasActiveCycle ? transaction.business.subscriptionEndsAt : null
    const newEndDate = getNewSubscriptionEndDate(body.data.interval, baseDateForRenewal)
    await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCEEDED',
          paidAt: new Date(),
          reference: body.data.razorpayPaymentId,
          metadata: {
            gateway: 'RAZORPAY',
            razorpayOrderId: body.data.razorpayOrderId,
            razorpayPaymentId: body.data.razorpayPaymentId,
          },
        },
      })

      await tx.business.update({
        where: { id: bizId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionPlan: 'STARTER',
          subscriptionInterval: body.data.interval,
          subscriptionEndsAt: newEndDate,
          isActive: true,
          suspendedReason: null,
        },
      })
    })

    const refreshedUser = await prisma.user.findUnique({
      where: { id: (req.user as any).id },
      include: { business: true },
    })
    if (!refreshedUser) return reply.status(404).send({ success: false, error: 'User not found after payment verification' })

    const authUser = buildSettingsAuthUser({
      ...refreshedUser,
      accessLocked: false,
      accessReason: '',
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

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

    const business = await prisma.business.findUnique({ where: { id: bizId } })
    if (!business) return reply.status(404).send({ success: false, error: 'Business not found' })
    if (!business.subscriptionInterval) {
      return reply.status(400).send({ success: false, error: 'No paid subscription is active to cancel.' })
    }

    const updated = await prisma.business.update({
      where: { id: bizId },
      data: {
        subscriptionStatus: 'CANCELLED',
      },
    })

    const refreshedUser = await prisma.user.findUnique({
      where: { id: (req.user as any).id },
      include: { business: true },
    })
    if (!refreshedUser) return reply.status(404).send({ success: false, error: 'User not found after cancellation' })

    const settings = await ensurePlatformSettings()
    const access = computeBusinessAccess(updated, settings)
    const authUser = buildSettingsAuthUser({
      ...refreshedUser,
      accessLocked: access.accessLocked,
      accessReason: access.reason,
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

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

    const business = await prisma.business.update({
      where: { id: bizId },
      data: body.data,
    })

    return { success: true, data: business }
  })

  app.patch('/reminders', async (req, reply) => {
    const bizId = getBizId(req)
    const body = UpdateReminderRulesSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const business = await prisma.business.update({
      where: { id: bizId },
      data: body.data,
    })

    return { success: true, data: business }
  })

  app.patch('/profile', async (req, reply) => {
    const userId = (req.user as any).id
    const body = UpdateProfileSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    if (body.data.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
      if (existing && existing.id !== userId) {
        return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: body.data,
      select: { id: true, name: true, phone: true, role: true },
    })

    return { success: true, data: user }
  })

  app.post('/change-password', async (req, reply) => {
    const userId = (req.user as any).id
    const body = ChangePasswordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })

    const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Current password is incorrect' })

    const passwordHash = await bcrypt.hash(body.data.newPassword, 10)
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

    return { success: true }
  })

  app.get('/staff', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const staff = await prisma.user.findMany({
      where: { businessId: bizId, role: 'MUNIM' },
      select: { id: true, name: true, phone: true, role: true, permissions: true, isActive: true, createdAt: true },
    })
    return { success: true, data: staff }
  })

  app.post('/staff', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const bizId = getBizId(req)
    const body = CreateStaffSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
    if (existing) return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })

    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const staff = await prisma.user.create({
      data: {
        name: body.data.name,
        phone: body.data.phone,
        passwordHash,
        role: 'MUNIM',
        permissions: body.data.permissions,
        businessId: bizId,
      },
      select: { id: true, name: true, phone: true, role: true, permissions: true, isActive: true },
    })
    return { success: true, data: staff }
  })

  app.patch('/staff/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const { id } = req.params as any
    const body = UpdateStaffSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.message })

    if (body.data.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
      if (existing && existing.id !== id) {
        return reply.status(409).send({ success: false, error: 'A user with this phone number already exists' })
      }
    }

    const staff = await prisma.user.update({
      where: { id },
      data: body.data,
      select: { id: true, name: true, phone: true, role: true, permissions: true, isActive: true },
    })
    return { success: true, data: staff }
  })

  app.delete('/staff/:id', async (req, reply) => {
    if (!requireOwner(req, reply)) return
    const { id } = req.params as any
    await prisma.user.update({ where: { id }, data: { isActive: false } })
    return { success: true }
  })
}
