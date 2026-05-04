import type { FastifyRequest } from 'fastify'
import { subscriptionsRepository } from '@cement-house/db'
import { getBizId } from '../middleware/auth'

export type UsageResourceKey =
  | 'users'
  | 'products'
  | 'customers'
  | 'ordersPerMonth'
  | 'invoicesPerMonth'

export type PlanFeatureKey =
  | 'allowExports'
  | 'allowAdvancedReports'
  | 'allowMultipleLocations'

export function getBusinessIdOrThrow(req: FastifyRequest) {
  return getBizId(req)
}

export function hasModule(enabledModules: unknown, moduleKey: string) {
  if (!Array.isArray(enabledModules)) return false
  return enabledModules.some((entry) => typeof entry === 'string' && entry === moduleKey)
}

export function hasFeature(featureFlags: unknown, featureKey: string) {
  if (!featureFlags || typeof featureFlags !== 'object' || Array.isArray(featureFlags)) return false
  return (featureFlags as Record<string, unknown>)[featureKey] === true
}

export async function getSubscriptionAccessContext(businessId: string) {
  const [subscription, usage] = await Promise.all([
    subscriptionsRepository.getCurrentSubscriptionByBusiness(businessId),
    subscriptionsRepository.getUsageSummary(businessId),
  ])
  return { subscription, usage }
}

export async function checkUsageLimit(businessId: string, resource: UsageResourceKey) {
  const { subscription, usage } = await getSubscriptionAccessContext(businessId)
  const limits = subscription?.limits
  if (!subscription || !limits) return { allowed: true, reason: '', usage, limits: null }

  if (subscription.status === 'EXPIRED' || subscription.status === 'CANCELLED') {
    return { allowed: false, reason: 'PLAN_EXPIRED', usage, limits }
  }

  const checks: Record<UsageResourceKey, { current: number; max: number | null }> = {
    users: { current: usage.users, max: limits.maxUsers },
    products: { current: usage.products, max: limits.maxProducts },
    customers: { current: usage.customers, max: limits.maxCustomers },
    ordersPerMonth: { current: usage.ordersThisMonth, max: limits.maxOrdersPerMonth },
    invoicesPerMonth: { current: usage.invoicesThisMonth, max: limits.maxInvoicesPerMonth },
  }

  const target = checks[resource]
  if (target.max == null) return { allowed: true, reason: '', usage, limits }
  if (target.current >= target.max) return { allowed: false, reason: 'LIMIT_EXCEEDED', usage, limits }
  return { allowed: true, reason: '', usage, limits }
}

export async function checkPlanLimit(businessId: string, featureKey: PlanFeatureKey) {
  const { subscription } = await getSubscriptionAccessContext(businessId)
  const limits = subscription?.limits
  if (!subscription || !limits) return { allowed: true, reason: '' }
  if (subscription.status === 'EXPIRED' || subscription.status === 'CANCELLED') {
    return { allowed: false, reason: 'PLAN_EXPIRED' as const }
  }
  if (limits[featureKey] !== true) return { allowed: false, reason: 'FEATURE_BLOCKED' as const }
  return { allowed: true, reason: '' as const }
}

export async function ensureUsageAllowed(
  businessId: string,
  resource: UsageResourceKey,
): Promise<void> {
  const check = await checkUsageLimit(businessId, resource)
  if (!check.allowed) {
    if (check.reason === 'PLAN_EXPIRED') throw new Error('PLAN_EXPIRED')
    throw new Error('LIMIT_EXCEEDED')
  }
}

export function isFeatureAllowedByPlan(
  businessFeatureFlags: unknown,
  planFeatures: Record<string, unknown> | null | undefined,
  featureKey: string,
) {
  const businessEnabled = hasFeature(businessFeatureFlags, featureKey)
  if (!businessEnabled) return false
  if (!planFeatures || typeof planFeatures !== 'object') return businessEnabled
  const override = (planFeatures as Record<string, unknown>)[featureKey]
  if (typeof override === 'boolean') return override && businessEnabled
  return businessEnabled
}
