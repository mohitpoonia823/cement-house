import type { BillingInterval, Business, PaymentMethod, PlatformSetting, Prisma, PrismaClient, SubscriptionStatus } from '@cement-house/db'
import { prisma } from '@cement-house/db'

const PLATFORM_SETTINGS_ID = 'default'

type DbLike = PrismaClient | Prisma.TransactionClient

export type BusinessWithBilling = Pick<
  Business,
  | 'id'
  | 'name'
  | 'subscriptionStatus'
  | 'subscriptionEndsAt'
  | 'trialStartedAt'
  | 'trialDaysOverride'
  | 'subscriptionInterval'
  | 'monthlySubscriptionAmount'
  | 'yearlySubscriptionAmount'
  | 'isActive'
  | 'suspendedReason'
>

export async function ensurePlatformSettings(db: DbLike = prisma) {
  return db.platformSetting.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    update: {},
    create: {
      id: PLATFORM_SETTINGS_ID,
      trialDays: 7,
      monthlyPrice: 200,
      yearlyPrice: 2100,
      currency: 'INR',
      trialRequiresCard: true,
    },
  })
}

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function deriveBusinessPricing(business: Pick<BusinessWithBilling, 'trialDaysOverride' | 'monthlySubscriptionAmount' | 'yearlySubscriptionAmount'>, settings: Pick<PlatformSetting, 'trialDays' | 'monthlyPrice' | 'yearlyPrice' | 'currency'>) {
  return {
    trialDays: business.trialDaysOverride ?? settings.trialDays,
    monthlyPrice: Number(business.monthlySubscriptionAmount ?? settings.monthlyPrice ?? 0) || Number(settings.monthlyPrice),
    yearlyPrice: Number(business.yearlySubscriptionAmount ?? settings.yearlyPrice ?? 0) || Number(settings.yearlyPrice),
    currency: settings.currency,
  }
}

export function formatDateIso(date: Date | null | undefined) {
  return date ? new Date(date).toISOString() : null
}

export function computeBusinessAccess(business: BusinessWithBilling, settings: Pick<PlatformSetting, 'trialDays' | 'monthlyPrice' | 'yearlyPrice' | 'currency'>, now = new Date()) {
  const pricing = deriveBusinessPricing(business, settings)
  const subscriptionEndsAt = business.subscriptionEndsAt ? new Date(business.subscriptionEndsAt) : null
  const hasActivePaidInterval = Boolean(business.subscriptionInterval)
  const expired = subscriptionEndsAt ? subscriptionEndsAt.getTime() <= now.getTime() : business.subscriptionStatus !== 'ACTIVE'
  const isSuspended = business.subscriptionStatus === 'SUSPENDED' || !business.isActive

  let accessLocked = false
  let reason = ''
  let effectiveStatus: SubscriptionStatus = business.subscriptionStatus

  if (isSuspended) {
    accessLocked = true
    effectiveStatus = 'SUSPENDED'
    reason = business.suspendedReason?.trim() || 'Workspace access is currently suspended. Please contact support.'
  } else if (subscriptionEndsAt && expired) {
    accessLocked = true
    effectiveStatus = business.subscriptionStatus === 'CANCELLED' ? 'CANCELLED' : 'PAST_DUE'
    reason = hasActivePaidInterval
      ? 'Your subscription period has ended. Renew the plan to unlock the workspace.'
      : 'Your free trial has ended. Choose a paid plan to continue using the workspace.'
  } else if (!subscriptionEndsAt && business.subscriptionStatus !== 'ACTIVE') {
    accessLocked = true
    effectiveStatus = business.subscriptionStatus === 'TRIAL' ? 'PAST_DUE' : business.subscriptionStatus
    reason = hasActivePaidInterval
      ? 'A valid subscription end date is missing. Renew the plan to continue.'
      : 'Your workspace trial is not active. Start or renew a paid plan to continue.'
  }

  const millisRemaining = subscriptionEndsAt ? subscriptionEndsAt.getTime() - now.getTime() : 0
  const daysRemaining = subscriptionEndsAt ? Math.max(0, Math.ceil(millisRemaining / 86_400_000)) : 0

  return {
    pricing,
    accessLocked,
    reason,
    effectiveStatus,
    endsAt: subscriptionEndsAt,
    endsAtIso: formatDateIso(subscriptionEndsAt),
    daysRemaining,
    inTrial: !hasActivePaidInterval,
    subscriptionInterval: business.subscriptionInterval ?? null,
  }
}

export function detectCardBrand(cardNumber: string) {
  const sanitized = cardNumber.replace(/\D/g, '')
  if (/^4/.test(sanitized)) return 'VISA'
  if (/^(5[1-5]|2[2-7])/.test(sanitized)) return 'MASTERCARD'
  if (/^3[47]/.test(sanitized)) return 'AMEX'
  if (/^(6|65)/.test(sanitized)) return 'RUPAY'
  return 'CARD'
}

export function sanitizeCardNumber(cardNumber: string) {
  return cardNumber.replace(/\D/g, '')
}

export function passesLuhn(cardNumber: string) {
  let sum = 0
  let shouldDouble = false
  for (let i = cardNumber.length - 1; i >= 0; i -= 1) {
    let digit = Number(cardNumber[i] ?? 0)
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

export function validateDummyCard(input: {
  cardholderName: string
  cardNumber: string
  expMonth: number
  expYear: number
  cvv: string
}) {
  const sanitized = sanitizeCardNumber(input.cardNumber)
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const expYear = Number(input.expYear)
  const expMonth = Number(input.expMonth)

  if (input.cardholderName.trim().length < 2) {
    throw new Error('Cardholder name is required')
  }
  if (sanitized.length < 13 || sanitized.length > 19) {
    throw new Error('Enter a valid card number')
  }
  if (!passesLuhn(sanitized)) {
    throw new Error('Card number failed validation')
  }
  if (expMonth < 1 || expMonth > 12) {
    throw new Error('Enter a valid expiry month')
  }
  if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
    throw new Error('Card expiry date is in the past')
  }
  if (!/^\d{3}$/.test(input.cvv)) {
    throw new Error('CVV must be exactly 3 digits')
  }
}

export function computeSubscriptionAmount(
  business: Pick<BusinessWithBilling, 'trialDaysOverride' | 'monthlySubscriptionAmount' | 'yearlySubscriptionAmount'>,
  settings: Pick<PlatformSetting, 'trialDays' | 'monthlyPrice' | 'yearlyPrice' | 'currency'>,
  interval: BillingInterval
) {
  const pricing = deriveBusinessPricing(business, settings)
  return interval === 'YEARLY' ? pricing.yearlyPrice : pricing.monthlyPrice
}

export async function saveDummyPaymentMethod(db: DbLike, businessId: string, input: {
  cardholderName: string
  cardNumber: string
  expMonth: number
  expYear: number
}) {
  const sanitized = sanitizeCardNumber(input.cardNumber)
  const brand = detectCardBrand(sanitized)
  const last4 = sanitized.slice(-4)

  await db.paymentMethod.updateMany({
    where: { businessId, isDefault: true },
    data: { isDefault: false },
  })

  return db.paymentMethod.create({
    data: {
      businessId,
      provider: 'DUMMY',
      providerCustomerId: `dummy_customer_${businessId}`,
      providerPaymentMethodId: `dummy_pm_${Date.now()}`,
      cardholderName: input.cardholderName.trim(),
      brand,
      last4,
      expMonth: Number(input.expMonth),
      expYear: Number(input.expYear),
      isDefault: true,
    },
  })
}

export async function getDefaultPaymentMethod(db: DbLike, businessId: string) {
  return db.paymentMethod.findFirst({
    where: { businessId, isDefault: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function syncBusinessStatusIfNeeded(db: DbLike, business: BusinessWithBilling, settings: Pick<PlatformSetting, 'trialDays' | 'monthlyPrice' | 'yearlyPrice' | 'currency'>) {
  const access = computeBusinessAccess(business, settings)
  if (
    access.effectiveStatus !== business.subscriptionStatus ||
    (access.effectiveStatus === 'SUSPENDED' && business.isActive)
  ) {
    await db.business.update({
      where: { id: business.id },
      data: {
        subscriptionStatus: access.effectiveStatus,
        isActive: access.effectiveStatus === 'SUSPENDED' ? false : business.isActive,
      },
    })
  }
  return access
}

export async function createDummySubscriptionCharge(db: DbLike, input: {
  business: BusinessWithBilling
  paymentMethod: PaymentMethod
  interval: BillingInterval
  settings: Pick<PlatformSetting, 'trialDays' | 'monthlyPrice' | 'yearlyPrice' | 'currency'>
}) {
  const amount =
    input.interval === 'YEARLY'
      ? deriveBusinessPricing(input.business, input.settings).yearlyPrice
      : deriveBusinessPricing(input.business, input.settings).monthlyPrice

  const transaction = await db.paymentTransaction.create({
    data: {
      businessId: input.business.id,
      paymentMethodId: input.paymentMethod.id,
      provider: 'DUMMY',
      interval: input.interval,
      amount,
      currency: input.settings.currency,
      status: 'PENDING',
      reference: `dummy_charge_${Date.now()}`,
    },
  })

  const newEndDate = addDays(new Date(), input.interval === 'YEARLY' ? 365 : 30)

  await db.paymentTransaction.update({
    where: { id: transaction.id },
    data: {
      status: 'SUCCEEDED',
      paidAt: new Date(),
    },
  })

  await db.business.update({
    where: { id: input.business.id },
    data: {
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'STARTER',
      subscriptionInterval: input.interval,
      subscriptionEndsAt: newEndDate,
      isActive: true,
      suspendedReason: null,
    },
  })

  return {
    id: transaction.id,
    amount,
    currency: input.settings.currency,
    interval: input.interval,
    paidAt: new Date().toISOString(),
    endsAt: newEndDate.toISOString(),
  }
}
