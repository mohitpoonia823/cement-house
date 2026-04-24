import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@cement-house/db'
import {
  computeBusinessAccess,
  createDummySubscriptionCharge,
  ensurePlatformSettings,
  getDefaultPaymentMethod,
  saveDummyPaymentMethod,
  syncBusinessStatusIfNeeded,
  validateDummyCard,
} from '../../services/billing'

const LoginSchema = z.object({
  phone: z.string().min(10).max(10),
  password: z.string().min(6),
})

const CardInputSchema = z.object({
  cardholderName: z.string().trim().min(2),
  cardNumber: z.string().trim().regex(/^\d{13,19}$/),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 25),
  cvv: z.string().trim().regex(/^\d{3}$/),
})

const RegisterSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(10),
  password: z.string().min(6),
  role: z.enum(['OWNER', 'MUNIM']).default('OWNER'),
  businessName: z.string().min(2),
  city: z.string().min(2),
  businessPhone: z.string().min(10).max(10).optional(),
  address: z.string().optional(),
})

const SuperAdminSetupSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(10),
  password: z.string().min(6),
  setupKey: z.string().min(8),
})

const RenewSubscriptionSchema = z.object({
  phone: z.string().min(10).max(10),
  password: z.string().min(6),
  interval: z.enum(['MONTHLY', 'YEARLY']),
  card: CardInputSchema.optional(),
})

function buildAuthUser(user: {
  id: string
  name: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  businessId?: string | null
  permissions: string[]
  business?: {
    name: string
    city: string
    subscriptionStatus: string
    subscriptionEndsAt: Date | null
    subscriptionInterval: 'MONTHLY' | 'YEARLY' | null
    monthlySubscriptionAmount: unknown
    yearlySubscriptionAmount: unknown
    trialStartedAt: Date | null
    trialDaysOverride: number | null
    isActive: boolean
    suspendedReason: string | null
  } | null
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

export async function authRoutes(app: FastifyInstance) {
  app.get('/registration-config', async () => {
    const settings = await ensurePlatformSettings()

    return {
      success: true,
      data: {
        trialDays: settings.trialDays,
        monthlyPrice: Number(settings.monthlyPrice),
        yearlyPrice: Number(settings.yearlyPrice),
        currency: settings.currency,
        trialRequiresCard: settings.trialRequiresCard,
      },
    }
  })

  app.get('/super-admin/setup-status', async () => {
    const configured = Boolean(process.env.SUPER_ADMIN_SETUP_KEY)
    const existingCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })

    return {
      success: true,
      data: {
        configured,
        canCreate: configured && existingCount === 0,
        hasSuperAdmin: existingCount > 0,
      },
    }
  })

  app.post('/super-admin/setup', async (req, reply) => {
    const body = SuperAdminSetupSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' })

    const configuredKey = process.env.SUPER_ADMIN_SETUP_KEY
    if (!configuredKey) {
      return reply.status(403).send({ success: false, error: 'Super Admin setup is not enabled on this server' })
    }

    if (body.data.setupKey !== configuredKey) {
      return reply.status(401).send({ success: false, error: 'Invalid setup key' })
    }

    const existingSuperAdmin = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } })
    if (existingSuperAdmin > 0) {
      return reply.status(409).send({ success: false, error: 'A Super Admin account already exists. Sign in instead.' })
    }

    const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
    if (existing) {
      return reply.status(409).send({ success: false, error: 'An account with this phone number already exists' })
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const user = await prisma.user.create({
      data: {
        name: body.data.name,
        phone: body.data.phone,
        role: 'SUPER_ADMIN',
        passwordHash,
      },
    })

    const authUser = buildAuthUser(user)
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

    return {
      success: true,
      data: {
        token,
        user: authUser,
      },
    }
  })

  app.post('/login', async (req, reply) => {
    const body = LoginSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' })

    const user = await prisma.user.findUnique({
      where: { phone: body.data.phone },
      include: { business: true },
    })
    if (!user || !user.isActive) return reply.status(401).send({ success: false, error: 'Invalid credentials' })

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Invalid credentials' })

    let accessLocked = false
    let accessReason = ''
    if (user.business) {
      const settings = await ensurePlatformSettings()
      const access = await syncBusinessStatusIfNeeded(prisma, user.business, settings)
      accessLocked = access.accessLocked
      accessReason = access.reason
      user.business.subscriptionStatus = access.effectiveStatus
    }

    const authUser = buildAuthUser({
      ...user,
      accessLocked,
      accessReason,
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

    return {
      success: true,
      data: {
        token,
        user: authUser,
      },
    }
  })

  app.post('/register', async (req, reply) => {
    const body = RegisterSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' })

    const existing = await prisma.user.findUnique({ where: { phone: body.data.phone } })
    if (existing) return reply.status(409).send({ success: false, error: 'An account with this phone number already exists' })

    const settings = await ensurePlatformSettings()
    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const trialDays = settings.trialDays
    const now = new Date()
    const trialEndsAt = new Date(now)
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays)

    const { business, user } = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: body.data.businessName,
          city: body.data.city,
          phone: body.data.businessPhone || body.data.phone,
          address: body.data.address || undefined,
          subscriptionPlan: 'STARTER',
          subscriptionStatus: 'TRIAL',
          subscriptionEndsAt: trialEndsAt,
          trialStartedAt: now,
          monthlySubscriptionAmount: settings.monthlyPrice,
          yearlySubscriptionAmount: settings.yearlyPrice,
        },
      })

      const user = await tx.user.create({
        data: {
          name: body.data.name,
          phone: body.data.phone,
          role: body.data.role,
          passwordHash,
          businessId: business.id,
        },
      })

      return { business, user }
    })

    const authUser = buildAuthUser({
      ...user,
      business,
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

    return {
      success: true,
      data: {
        token,
        user: authUser,
      },
    }
  })

  app.post('/renew-subscription', async (req, reply) => {
    const body = RenewSubscriptionSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid input' })

    const user = await prisma.user.findUnique({
      where: { phone: body.data.phone },
      include: { business: true },
    })
    if (!user || !user.isActive || user.role !== 'OWNER' || !user.business) {
      return reply.status(401).send({ success: false, error: 'Owner account not found' })
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash)
    if (!valid) return reply.status(401).send({ success: false, error: 'Invalid credentials' })

    const settings = await ensurePlatformSettings()

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.findUnique({ where: { id: user.businessId! } })
      if (!business) throw new Error('Business not found')

      let paymentMethod = await getDefaultPaymentMethod(tx, business.id)

      if (body.data.card) {
        validateDummyCard(body.data.card)
        paymentMethod = await saveDummyPaymentMethod(tx, business.id, {
          cardholderName: body.data.card.cardholderName,
          cardNumber: body.data.card.cardNumber,
          expMonth: body.data.card.expMonth,
          expYear: body.data.card.expYear,
        })
      }

      if (!paymentMethod) {
        throw new Error('Add a payment method before starting a subscription')
      }

      return createDummySubscriptionCharge(tx, {
        business,
        paymentMethod,
        interval: body.data.interval,
        settings,
      })
    })

    const refreshedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { business: true },
    })
    if (!refreshedUser) return reply.status(404).send({ success: false, error: 'User not found after payment' })

    const authUser = buildAuthUser({
      ...refreshedUser,
      accessLocked: false,
      accessReason: '',
    })
    const token = app.jwt.sign(authUser, { expiresIn: '7d' })

    return {
      success: true,
      data: {
        token,
        user: authUser,
        payment: result,
      },
    }
  })

  app.post('/logout', async () => ({ success: true }))
}
