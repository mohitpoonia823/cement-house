import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma, prisma } from '@cement-house/db'
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
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['OWNER', 'MUNIM']).default('OWNER'),
  businessName: z.string().min(2),
  businessType: z.enum(['GENERAL', 'CEMENT', 'HARDWARE_SANITARY', 'KIRYANA', 'CUSTOM']).default('GENERAL'),
  customBusinessTypeName: z.string().trim().min(2).max(60).optional(),
  city: z.string().min(2),
  businessPhone: z.string().min(10).max(10).optional(),
  address: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.businessType === 'CUSTOM' && !value.customBusinessTypeName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customBusinessTypeName'],
      message: 'Custom business type name is required',
    })
  }
})

const SuperAdminSetupSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(10),
  email: z.string().email(),
  password: z.string().min(6),
  setupKey: z.string().min(8),
})

const ForgotPasswordSchema = z
  .object({
    email: z.string().trim().email().optional(),
    phone: z.string().trim().regex(/^\d{10}$/).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: 'Either email or phone is required',
  })

const ResetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(6),
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
  email?: string | null
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  businessId?: string | null
  permissions: string[]
  business?: {
    name: string
    city: string
    businessType?: string | null
    customLabels?: Prisma.JsonValue | Record<string, string> | null
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
  const normalizeCustomLabels = (value: Prisma.JsonValue | Record<string, string> | null | undefined): Record<string, string> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => typeof entryValue === 'string')
    return entries.length > 0 ? Object.fromEntries(entries) as Record<string, string> : null
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email ?? null,
    role: user.role,
    businessId: user.businessId ?? null,
    businessName: user.business?.name ?? null,
    businessCity: user.business?.city ?? null,
    businessType: user.business?.businessType ?? 'GENERAL',
    customLabels: normalizeCustomLabels(user.business?.customLabels),
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

async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const subject = 'Reset your Business Hub password'
  const text = [
    'Hello,',
    '',
    'We received a request to reset your Business Hub password.',
    `Reset link: ${resetUrl}`,
    'This link expires in 30 minutes.',
    'If you did not request this, you can ignore this email.',
  ].join('\n')
  const html = `
    <p>Hello,</p>
    <p>We received a request to reset your Business Hub password.</p>
    <p><a href="${resetUrl}">Click here to reset your password</a></p>
    <p>This link expires in 30 minutes.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `

  const smtpHost = process.env.SMTP_HOST?.trim() || ''
  const smtpPort = Number(process.env.SMTP_PORT?.trim() || '465')
  const smtpUser = process.env.SMTP_USER?.trim() || ''
  const smtpPass = process.env.SMTP_PASS?.trim() || ''
  const smtpSecureRaw = process.env.SMTP_SECURE?.trim().toLowerCase()
  const smtpSecure = smtpSecureRaw ? smtpSecureRaw === 'true' : smtpPort === 465
  const smtpFrom = process.env.SMTP_FROM_EMAIL?.trim() || ''

  if (smtpHost.includes('@')) {
    console.warn('[auth] SMTP_HOST looks invalid (it contains "@"). Use host like "smtp.gmail.com", not an email address.')
    return false
  }

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom || Number.isNaN(smtpPort)) return false

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject,
      text,
      html,
    })
    return true
  } catch (error) {
    console.warn('[auth] SMTP send failed', error)
    return false
  }
}

async function emailExists(email: string) {
  await ensureAuthSupportTables()
  const rows = await prisma.$queryRaw<Array<{ exists: number }>>`
    SELECT 1::int AS exists
    FROM user_emails
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `
  return rows.length > 0
}

async function findActiveUserByEmail(email: string) {
  await ensureAuthSupportTables()
  const rows = await prisma.$queryRaw<Array<{ userId: string; email: string; isActive: boolean }>>`
    SELECT
      u.id AS "userId",
      ue.email AS email,
      u."isActive" AS "isActive"
    FROM user_emails ue
    INNER JOIN users u ON u.id = ue.user_id
    WHERE LOWER(ue.email) = LOWER(${email})
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

async function findActiveUserByPhone(phone: string) {
  await ensureAuthSupportTables()
  const rows = await prisma.$queryRaw<Array<{ userId: string; email: string | null; isActive: boolean }>>`
    SELECT
      u.id AS "userId",
      ue.email AS email,
      u."isActive" AS "isActive"
    FROM users u
    LEFT JOIN user_emails ue ON ue.user_id = u.id
    WHERE u.phone = ${phone}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

async function attachEmailToUser(tx: Prisma.TransactionClient, userId: string, email: string) {
  await ensureAuthSupportTables()
  await tx.$executeRaw`
    INSERT INTO user_emails (user_id, email)
    VALUES (${userId}, ${email})
  `
}

let ensureAuthSupportTablesPromise: Promise<void> | null = null

function ensureAuthSupportTables() {
  if (!ensureAuthSupportTablesPromise) {
    ensureAuthSupportTablesPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS user_emails (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          email TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_expires_at_idx
        ON password_reset_tokens(user_id, expires_at)
      `)
    })().catch((error) => {
      ensureAuthSupportTablesPromise = null
      throw error
    })
  }
  return ensureAuthSupportTablesPromise
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/registration-config', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    reply.header('Pragma', 'no-cache')
    reply.header('Expires', '0')

    const settings = await ensurePlatformSettings()

    return {
      success: true,
      data: {
        trialDays: settings.trialDays,
        monthlyPrice: Number(settings.monthlyPrice),
        yearlyPrice: Number(settings.yearlyPrice),
        currency: settings.currency,
        trialRequiresCard: settings.trialRequiresCard,
        updatedAt: settings.updatedAt?.toISOString?.() ?? null,
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
    const existingEmail = await emailExists(body.data.email)
    if (existingEmail) {
      return reply.status(409).send({ success: false, error: 'An account with this email already exists' })
    }

    const passwordHash = await bcrypt.hash(body.data.password, 10)
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: body.data.name,
          phone: body.data.phone,
          role: 'SUPER_ADMIN',
          passwordHash,
        },
      })
      await attachEmailToUser(tx, created.id, body.data.email)
      return created
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
    const existingEmail = await emailExists(body.data.email)
    if (existingEmail) return reply.status(409).send({ success: false, error: 'An account with this email already exists' })

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
          businessType: body.data.businessType,
          customLabels:
            body.data.businessType === 'CUSTOM' && body.data.customBusinessTypeName
              ? ({ businessTypeName: body.data.customBusinessTypeName } as Prisma.JsonObject)
              : undefined,
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

      await attachEmailToUser(tx, user.id, body.data.email)

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

  app.post('/forgot-password', async (req) => {
    const body = ForgotPasswordSchema.safeParse(req.body)
    if (!body.success) return { success: true, data: { message: 'If the account exists, a reset link has been sent.' } }

    await ensureAuthSupportTables()
    const user = body.data.email
      ? await findActiveUserByEmail(body.data.email)
      : body.data.phone
        ? await findActiveUserByPhone(body.data.phone)
        : null

    if (user && user.isActive && !user.email) {
      return {
        success: false,
        error: 'No recovery email is linked to this account. Contact admin to add an email, then retry.',
        code: 'NO_RECOVERY_EMAIL',
      }
    }

    if (user?.email && user.isActive) {
      const rawToken = randomBytes(32).toString('hex')
      const tokenHash = createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

      await prisma.$executeRaw`
        INSERT INTO password_reset_tokens (
          id,
          user_id,
          token_hash,
          expires_at
        ) VALUES (
          ${randomUUID()},
          ${user.userId},
          ${tokenHash},
          ${expiresAt}
        )
      `

      const baseUrl = (process.env.WEB_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')
      const resetUrl = `${baseUrl}/auth/reset-password?token=${rawToken}`
      const sent = await sendPasswordResetEmail(user.email, resetUrl)
      if (!sent && process.env.NODE_ENV !== 'production') {
        console.info(`[password-reset-link] ${user.email}: ${resetUrl}`)
      }
    }

    return { success: true, data: { message: 'If the account exists, a reset link has been sent.' } }
  })

  app.post('/reset-password', async (req, reply) => {
    const body = ResetPasswordSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid reset request' })

    await ensureAuthSupportTables()
    const tokenHash = createHash('sha256').update(body.data.token).digest('hex')
    const rows = await prisma.$queryRaw<Array<{
      id: string
      userId: string
      expiresAt: Date
      usedAt: Date | null
      isActive: boolean
    }>>`
      SELECT
        prt.id,
        prt.user_id AS "userId",
        prt.expires_at AS "expiresAt",
        prt.used_at AS "usedAt",
        u."isActive" AS "isActive"
      FROM password_reset_tokens prt
      INNER JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = ${tokenHash}
      LIMIT 1
    `
    const token = rows[0]

    if (!token || token.usedAt || token.expiresAt.getTime() < Date.now() || !token.isActive) {
      return reply.status(400).send({ success: false, error: 'Reset link is invalid or expired' })
    }

    const passwordHash = await bcrypt.hash(body.data.newPassword, 10)
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      })
      await tx.$executeRaw`
        UPDATE password_reset_tokens
        SET used_at = ${new Date()}
        WHERE id = ${token.id}
      `
    })

    return { success: true, data: { message: 'Password has been reset successfully.' } }
  })

  app.post('/logout', async () => ({ success: true }))
}
