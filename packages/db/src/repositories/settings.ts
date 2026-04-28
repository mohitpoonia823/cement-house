import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
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

export interface StaffRow {
  id: string
  name: string
  phone: string
  email: string | null
  role: 'MUNIM'
  permissions: string[]
  isActive: boolean
  createdAt: Date
}

export interface SettingsBusinessRow {
  id: string
  name: string
  city: string
  address: string | null
  phone: string | null
  gstin: string | null
  isActive: boolean
  remindersEnabled: boolean
  reminderSoftDays: number
  reminderFollowDays: number
  reminderFirmDays: number
  subscriptionPlan: string
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED'
  subscriptionEndsAt: Date | null
  trialStartedAt: Date | null
  trialDaysOverride: number | null
  subscriptionInterval: 'MONTHLY' | 'YEARLY' | null
  monthlySubscriptionAmount: number
  yearlySubscriptionAmount: number
  suspendedReason: string | null
  createdAt: Date
  updatedAt: Date
}

export interface SettingsUserRow {
  id: string
  name: string
  phone: string
  email: string | null
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
}

export interface SettingsPaymentMethodRow {
  id: string
  provider: 'DUMMY'
  brand: string
  last4: string
  expMonth: number
  expYear: number
  cardholderName: string
  isDefault: boolean
  createdAt: Date
}

export interface SettingsPaymentTransactionRow {
  id: string
  interval: 'MONTHLY' | 'YEARLY'
  amount: number
  currency: string
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  createdAt: Date
  paidAt: Date | null
  reference: string | null
  failureReason: string | null
}

export interface SettingsSessionUserRow {
  id: string
  name: string
  phone: string
  role: 'SUPER_ADMIN' | 'OWNER' | 'MUNIM'
  permissions: string[]
  businessId: string | null
  businessName: string | null
  businessCity: string | null
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED' | null
  subscriptionEndsAt: Date | null
  subscriptionInterval: 'MONTHLY' | 'YEARLY' | null
  monthlySubscriptionAmount: number | null
  yearlySubscriptionAmount: number | null
  trialStartedAt: Date | null
  trialDaysOverride: number | null
}

export interface SettingsPasswordUserRow {
  id: string
  passwordHash: string
}

export interface SettingsSubscriptionTxRow {
  id: string
  interval: 'MONTHLY' | 'YEARLY'
  amount: number
  currency: string
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED'
  reference: string | null
  businessSubscriptionEndsAt: Date | null
  businessSubscriptionInterval: 'MONTHLY' | 'YEARLY' | null
}

interface UpdateBusinessInput {
  name?: string
  city?: string
  address?: string
  phone?: string
  gstin?: string
}

interface UpdateReminderRulesInput {
  remindersEnabled?: boolean
  reminderSoftDays?: number
  reminderFollowDays?: number
  reminderFirmDays?: number
}

interface UpdateUserProfileInput {
  name?: string
  phone?: string
  email?: string
}

interface CreateStaffInput {
  businessId: string
  name: string
  phone: string
  email?: string | null
  passwordHash: string
  permissions: string[]
}

interface UpdateStaffInput {
  name?: string
  phone?: string
  email?: string | null
  permissions?: string[]
  isActive?: boolean
}

interface CreatePendingTransactionInput {
  businessId: string
  paymentMethodId: string | null
  interval: 'MONTHLY' | 'YEARLY'
  amount: number
  currency: string
  reference: string
  metadata: Record<string, unknown>
}

interface MarkFailedSignatureInput {
  transactionId: string
  businessId: string
  razorpayOrderId: string
  razorpayPaymentId: string
}

interface FinalizeSubscriptionInput {
  transactionId: string
  businessId: string
  interval: 'MONTHLY' | 'YEARLY'
  razorpayOrderId: string
  razorpayPaymentId: string
  newEndDate: Date
}

function settingsBusinessSelectSql() {
  return Prisma.sql`
    SELECT
      id,
      name,
      city,
      address,
      phone,
      gstin,
      "isActive" AS "isActive",
      "remindersEnabled" AS "remindersEnabled",
      "reminderSoftDays" AS "reminderSoftDays",
      "reminderFollowDays" AS "reminderFollowDays",
      "reminderFirmDays" AS "reminderFirmDays",
      "subscriptionPlan"::text AS "subscriptionPlan",
      "subscriptionStatus"::text AS "subscriptionStatus",
      "subscriptionEndsAt" AS "subscriptionEndsAt",
      "trialStartedAt" AS "trialStartedAt",
      "trialDaysOverride" AS "trialDaysOverride",
      "subscriptionInterval"::text AS "subscriptionInterval",
      "monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      "yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
      "suspendedReason" AS "suspendedReason",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
    FROM businesses
  `
}

export async function getStaffByBusiness(businessId: string) {
  await ensureUserEmailsTable()
  return prisma.$queryRaw<StaffRow[]>`
    SELECT
      u.id,
      u.name,
      u.phone,
      ue.email AS email,
      u.role::text AS role,
      u.permissions,
      u."isActive" AS "isActive",
      u."createdAt" AS "createdAt"
    FROM users u
    LEFT JOIN user_emails ue ON ue.user_id = u.id
    WHERE u."businessId" = ${businessId} AND u.role = 'MUNIM'
    ORDER BY u."createdAt" DESC
  `
}

async function getStaffById(staffId: string, businessId: string) {
  await ensureUserEmailsTable()
  const rows = await prisma.$queryRaw<StaffRow[]>`
    SELECT
      u.id,
      u.name,
      u.phone,
      ue.email AS email,
      u.role::text AS role,
      u.permissions,
      u."isActive" AS "isActive",
      u."createdAt" AS "createdAt"
    FROM users u
    LEFT JOIN user_emails ue ON ue.user_id = u.id
    WHERE u.id = ${staffId} AND u."businessId" = ${businessId} AND u.role = 'MUNIM'::"UserRole"
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function getSettingsBusinessById(businessId: string) {
  const rows = await prisma.$queryRaw<SettingsBusinessRow[]>(Prisma.sql`
    ${settingsBusinessSelectSql()}
    WHERE id = ${businessId}
    LIMIT 1
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function getSettingsUserById(userId: string) {
  await ensureUserEmailsTable()
  const rows = await prisma.$queryRaw<SettingsUserRow[]>`
    SELECT
      u.id,
      u.name,
      u.phone,
      ue.email AS email,
      u.role::text AS role
    FROM users u
    LEFT JOIN user_emails ue ON ue.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function getSettingsSessionUserById(userId: string) {
  const rows = await prisma.$queryRaw<SettingsSessionUserRow[]>`
    SELECT
      u.id,
      u.name,
      u.phone,
      u.role::text AS role,
      u.permissions,
      u."businessId" AS "businessId",
      b.name AS "businessName",
      b.city AS "businessCity",
      b."subscriptionStatus"::text AS "subscriptionStatus",
      b."subscriptionEndsAt" AS "subscriptionEndsAt",
      b."subscriptionInterval"::text AS "subscriptionInterval",
      b."monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      b."yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
      b."trialStartedAt" AS "trialStartedAt",
      b."trialDaysOverride" AS "trialDaysOverride"
    FROM users u
    LEFT JOIN businesses b ON b.id = u."businessId"
    WHERE u.id = ${userId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function getDefaultPaymentMethodByBusiness(businessId: string) {
  const rows = await prisma.$queryRaw<SettingsPaymentMethodRow[]>`
    SELECT
      id,
      provider::text AS provider,
      brand,
      last4,
      "expMonth" AS "expMonth",
      "expYear" AS "expYear",
      "cardholderName" AS "cardholderName",
      "isDefault" AS "isDefault",
      "createdAt" AS "createdAt"
    FROM payment_methods
    WHERE "businessId" = ${businessId} AND "isDefault" = true
    ORDER BY "createdAt" DESC
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function getRecentPaymentTransactionsByBusiness(businessId: string, limit: number) {
  return prisma.$queryRaw<SettingsPaymentTransactionRow[]>`
    SELECT
      id,
      interval::text AS interval,
      amount::double precision AS amount,
      currency,
      status::text AS status,
      "createdAt" AS "createdAt",
      "paidAt" AS "paidAt",
      reference,
      "failureReason" AS "failureReason"
    FROM payment_transactions
    WHERE "businessId" = ${businessId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `
}

export async function createPendingPaymentTransaction(input: CreatePendingTransactionInput) {
  const rows = await prisma.$queryRaw<SettingsPaymentTransactionRow[]>(Prisma.sql`
    INSERT INTO payment_transactions (
      "businessId",
      "paymentMethodId",
      provider,
      interval,
      amount,
      currency,
      status,
      reference,
      metadata,
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${input.businessId},
      ${input.paymentMethodId},
      'DUMMY'::"PaymentProvider",
      ${input.interval}::"BillingInterval",
      ${input.amount},
      ${input.currency},
      'PENDING'::"PaymentStatus",
      ${input.reference},
      ${JSON.stringify(input.metadata)}::jsonb,
      NOW(),
      NOW()
    )
    RETURNING
      id,
      interval::text AS interval,
      amount::double precision AS amount,
      currency,
      status::text AS status,
      "createdAt" AS "createdAt",
      "paidAt" AS "paidAt",
      reference,
      "failureReason" AS "failureReason"
  `)
  return rows[0]
}

export async function markTransactionFailedForSignature(input: MarkFailedSignatureInput) {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE payment_transactions
    SET
      status = 'FAILED'::"PaymentStatus",
      "failureReason" = 'Signature verification failed',
      metadata = ${JSON.stringify({
        gateway: 'RAZORPAY',
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
      })}::jsonb,
      "updatedAt" = NOW()
    WHERE id = ${input.transactionId}
      AND "businessId" = ${input.businessId}
      AND status = 'PENDING'::"PaymentStatus"
  `)
}

export async function getSubscriptionTransactionForVerification(transactionId: string, businessId: string) {
  const rows = await prisma.$queryRaw<SettingsSubscriptionTxRow[]>`
    SELECT
      t.id,
      t.interval::text AS interval,
      t.amount::double precision AS amount,
      t.currency,
      t.status::text AS status,
      t.reference,
      b."subscriptionEndsAt" AS "businessSubscriptionEndsAt",
      b."subscriptionInterval"::text AS "businessSubscriptionInterval"
    FROM payment_transactions t
    INNER JOIN businesses b ON b.id = t."businessId"
    WHERE t.id = ${transactionId} AND t."businessId" = ${businessId}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function finalizeSubscriptionPayment(input: FinalizeSubscriptionInput) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE payment_transactions
      SET
        status = 'SUCCEEDED'::"PaymentStatus",
        "paidAt" = NOW(),
        reference = ${input.razorpayPaymentId},
        metadata = ${JSON.stringify({
          gateway: 'RAZORPAY',
          razorpayOrderId: input.razorpayOrderId,
          razorpayPaymentId: input.razorpayPaymentId,
        })}::jsonb,
        "updatedAt" = NOW()
      WHERE id = ${input.transactionId}
    `)

    await tx.$executeRaw(Prisma.sql`
      UPDATE businesses
      SET
        "subscriptionStatus" = 'ACTIVE'::"SubscriptionStatus",
        "subscriptionPlan" = 'STARTER'::"SubscriptionPlan",
        "subscriptionInterval" = ${input.interval}::"BillingInterval",
        "subscriptionEndsAt" = ${input.newEndDate},
        "isActive" = true,
        "suspendedReason" = NULL,
        "updatedAt" = NOW()
      WHERE id = ${input.businessId}
    `)
  })
}

export async function cancelSubscriptionByBusiness(businessId: string) {
  const rows = await prisma.$queryRaw<SettingsBusinessRow[]>(Prisma.sql`
    UPDATE businesses
    SET
      "subscriptionStatus" = 'CANCELLED'::"SubscriptionStatus",
      "updatedAt" = NOW()
    WHERE id = ${businessId}
    RETURNING
      id,
      name,
      city,
      address,
      phone,
      gstin,
      "isActive" AS "isActive",
      "remindersEnabled" AS "remindersEnabled",
      "reminderSoftDays" AS "reminderSoftDays",
      "reminderFollowDays" AS "reminderFollowDays",
      "reminderFirmDays" AS "reminderFirmDays",
      "subscriptionPlan"::text AS "subscriptionPlan",
      "subscriptionStatus"::text AS "subscriptionStatus",
      "subscriptionEndsAt" AS "subscriptionEndsAt",
      "trialStartedAt" AS "trialStartedAt",
      "trialDaysOverride" AS "trialDaysOverride",
      "subscriptionInterval"::text AS "subscriptionInterval",
      "monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      "yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
      "suspendedReason" AS "suspendedReason",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
  `)
  return rows.length > 0 ? rows[0] : null
}

export async function updateBusinessProfile(businessId: string, input: UpdateBusinessInput) {
  const updates: Prisma.Sql[] = []
  if (input.name !== undefined) updates.push(Prisma.sql`name = ${input.name}`)
  if (input.city !== undefined) updates.push(Prisma.sql`city = ${input.city}`)
  if (input.address !== undefined) updates.push(Prisma.sql`address = ${input.address}`)
  if (input.phone !== undefined) updates.push(Prisma.sql`phone = ${input.phone}`)
  if (input.gstin !== undefined) updates.push(Prisma.sql`gstin = ${input.gstin}`)
  if (updates.length === 0) return getSettingsBusinessById(businessId)
  updates.push(Prisma.sql`"updatedAt" = NOW()`)

  const rows = await prisma.$queryRaw<SettingsBusinessRow[]>(Prisma.sql`
    UPDATE businesses
    SET ${Prisma.join(updates, ', ')}
    WHERE id = ${businessId}
    RETURNING
      id,
      name,
      city,
      address,
      phone,
      gstin,
      "isActive" AS "isActive",
      "remindersEnabled" AS "remindersEnabled",
      "reminderSoftDays" AS "reminderSoftDays",
      "reminderFollowDays" AS "reminderFollowDays",
      "reminderFirmDays" AS "reminderFirmDays",
      "subscriptionPlan"::text AS "subscriptionPlan",
      "subscriptionStatus"::text AS "subscriptionStatus",
      "subscriptionEndsAt" AS "subscriptionEndsAt",
      "trialStartedAt" AS "trialStartedAt",
      "trialDaysOverride" AS "trialDaysOverride",
      "subscriptionInterval"::text AS "subscriptionInterval",
      "monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      "yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
      "suspendedReason" AS "suspendedReason",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
  `)

  return rows.length > 0 ? rows[0] : null
}

export async function updateBusinessReminders(businessId: string, input: UpdateReminderRulesInput) {
  const updates: Prisma.Sql[] = []
  if (input.remindersEnabled !== undefined) updates.push(Prisma.sql`"remindersEnabled" = ${input.remindersEnabled}`)
  if (input.reminderSoftDays !== undefined) updates.push(Prisma.sql`"reminderSoftDays" = ${input.reminderSoftDays}`)
  if (input.reminderFollowDays !== undefined) updates.push(Prisma.sql`"reminderFollowDays" = ${input.reminderFollowDays}`)
  if (input.reminderFirmDays !== undefined) updates.push(Prisma.sql`"reminderFirmDays" = ${input.reminderFirmDays}`)
  if (updates.length === 0) return getSettingsBusinessById(businessId)
  updates.push(Prisma.sql`"updatedAt" = NOW()`)

  const rows = await prisma.$queryRaw<SettingsBusinessRow[]>(Prisma.sql`
    UPDATE businesses
    SET ${Prisma.join(updates, ', ')}
    WHERE id = ${businessId}
    RETURNING
      id,
      name,
      city,
      address,
      phone,
      gstin,
      "isActive" AS "isActive",
      "remindersEnabled" AS "remindersEnabled",
      "reminderSoftDays" AS "reminderSoftDays",
      "reminderFollowDays" AS "reminderFollowDays",
      "reminderFirmDays" AS "reminderFirmDays",
      "subscriptionPlan"::text AS "subscriptionPlan",
      "subscriptionStatus"::text AS "subscriptionStatus",
      "subscriptionEndsAt" AS "subscriptionEndsAt",
      "trialStartedAt" AS "trialStartedAt",
      "trialDaysOverride" AS "trialDaysOverride",
      "subscriptionInterval"::text AS "subscriptionInterval",
      "monthlySubscriptionAmount"::double precision AS "monthlySubscriptionAmount",
      "yearlySubscriptionAmount"::double precision AS "yearlySubscriptionAmount",
      "suspendedReason" AS "suspendedReason",
      "createdAt" AS "createdAt",
      "updatedAt" AS "updatedAt"
  `)

  return rows.length > 0 ? rows[0] : null
}

export async function findUserByPhone(phone: string) {
  const rows = await prisma.$queryRaw<Pick<SettingsUserRow, 'id'>[]>`
    SELECT id
    FROM users
    WHERE phone = ${phone}
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function findUserByEmail(email: string) {
  await ensureUserEmailsTable()
  const rows = await prisma.$queryRaw<Pick<SettingsUserRow, 'id'>[]>`
    SELECT user_id AS id
    FROM user_emails
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `
  return rows.length > 0 ? rows[0] : null
}

export async function getUserPasswordById(userId: string) {
  const rows = await prisma.$queryRaw<SettingsPasswordUserRow[]>`
    SELECT id, "passwordHash" AS "passwordHash"
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

export async function updateUserProfile(userId: string, input: UpdateUserProfileInput) {
  await ensureUserEmailsTable()
  const updates: Prisma.Sql[] = []
  if (input.name !== undefined) updates.push(Prisma.sql`name = ${input.name}`)
  if (input.phone !== undefined) updates.push(Prisma.sql`phone = ${input.phone}`)

  if (updates.length === 0 && input.email === undefined) return getSettingsUserById(userId)

  await prisma.$transaction(async (tx) => {
    if (updates.length > 0) {
      updates.push(Prisma.sql`"updatedAt" = NOW()`)
      await tx.$executeRaw(Prisma.sql`
        UPDATE users
        SET ${Prisma.join(updates, ', ')}
        WHERE id = ${userId}
      `)
    }

    if (input.email !== undefined) {
      await tx.$executeRaw`
        INSERT INTO user_emails (user_id, email)
        VALUES (${userId}, ${input.email})
        ON CONFLICT (user_id)
        DO UPDATE SET email = EXCLUDED.email
      `
    }
  })

  return getSettingsUserById(userId)
}

export async function createStaff(input: CreateStaffInput) {
  await ensureUserEmailsTable()
  const newStaffId = randomUUID()
  const staffId = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO users (
        id,
        name,
        phone,
        "passwordHash",
        role,
        permissions,
        "businessId",
        "isActive",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${newStaffId},
        ${input.name},
        ${input.phone},
        ${input.passwordHash},
        'MUNIM'::"UserRole",
        ${input.permissions},
        ${input.businessId},
        true,
        NOW(),
        NOW()
      )
      RETURNING id
    `)

    if (input.email) {
      await tx.$executeRaw`
        INSERT INTO user_emails (user_id, email)
        VALUES (${rows[0].id}, ${input.email})
      `
    }

    return rows[0].id
  })

  const staff = await getStaffById(staffId, input.businessId)
  if (!staff) throw new Error('Staff member not found after creation')
  return staff
}

export async function updateStaff(staffId: string, businessId: string, input: UpdateStaffInput) {
  await ensureUserEmailsTable()
  const updates: Prisma.Sql[] = []
  if (input.name !== undefined) updates.push(Prisma.sql`name = ${input.name}`)
  if (input.phone !== undefined) updates.push(Prisma.sql`phone = ${input.phone}`)
  if (input.permissions !== undefined) updates.push(Prisma.sql`permissions = ${input.permissions}`)
  if (input.isActive !== undefined) updates.push(Prisma.sql`"isActive" = ${input.isActive}`)
  if (updates.length === 0 && input.email === undefined) return getStaffById(staffId, businessId)

  if (input.email !== undefined) {
    const existing = await getStaffById(staffId, businessId)
    if (!existing) return null
  }

  await prisma.$transaction(async (tx) => {
    if (updates.length > 0) {
      updates.push(Prisma.sql`"updatedAt" = NOW()`)
      await tx.$executeRaw(Prisma.sql`
        UPDATE users
        SET ${Prisma.join(updates, ', ')}
        WHERE id = ${staffId} AND "businessId" = ${businessId} AND role = 'MUNIM'::"UserRole"
      `)
    }

    if (input.email !== undefined) {
      if (input.email) {
        await tx.$executeRaw`
          INSERT INTO user_emails (user_id, email)
          VALUES (${staffId}, ${input.email})
          ON CONFLICT (user_id)
          DO UPDATE SET email = EXCLUDED.email
        `
      } else {
        await tx.$executeRaw`
          DELETE FROM user_emails
          WHERE user_id = ${staffId}
        `
      }
    }
  })

  return getStaffById(staffId, businessId)
}

export async function deactivateStaff(staffId: string, businessId: string) {
  await prisma.$executeRaw`
    UPDATE users
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE id = ${staffId} AND "businessId" = ${businessId} AND role = 'MUNIM'::"UserRole"
  `
}
