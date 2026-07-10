import type { Prisma } from '@cement-house/db'
import { getEnabledModulesForBusinessType, MODULE_KEYS } from '@cement-house/utils'

/**
 * Effective per-tenant capabilities: business-type/module config intersected
 * with the active subscription plan. This is the single place where
 * "what can this business do" is computed — the auth middleware attaches the
 * result to req.user and both route guards and handlers read from it.
 */
export interface EntitlementLimits {
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

export interface Entitlements {
  modules: string[]
  features: Record<string, boolean>
  limits: EntitlementLimits
}

// null = unlimited; used when a business has no plan_limits row (legacy plans).
export const UNLIMITED_LIMITS: EntitlementLimits = {
  maxUsers: null,
  maxProducts: null,
  maxCustomers: null,
  maxOrdersPerMonth: null,
  maxInvoicesPerMonth: null,
  storageLimit: null,
  allowExports: true,
  allowAdvancedReports: true,
  allowMultipleLocations: true,
}

const KNOWN_MODULES = new Set<string>(MODULE_KEYS)

function normalizeModules(value: Prisma.JsonValue | string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  return (value as unknown[]).filter(
    (entry): entry is string => typeof entry === 'string' && KNOWN_MODULES.has(entry),
  )
}

function normalizeFlags(
  value: Prisma.JsonValue | Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean'),
  ) as Record<string, boolean>
}

export function computeEntitlements(input: {
  businessType?: string | null
  enabledModules?: Prisma.JsonValue | string[] | null
  featureFlags?: Prisma.JsonValue | Record<string, boolean> | null
  planFeatures?: Record<string, unknown> | null
  planLimits?: Partial<EntitlementLimits> | null
}): Entitlements {
  // Businesses created before the module-config migration have an empty
  // enabledModules array — fall back to their business-type preset so they
  // are never locked out of core modules.
  const stored = normalizeModules(input.enabledModules)
  const modules = stored.length > 0 ? stored : getEnabledModulesForBusinessType(input.businessType)

  // Plan features only ever restrict: an explicit `false` on the plan wins
  // over a business-level `true`. Absent keys leave business flags untouched.
  const features = normalizeFlags(input.featureFlags)
  for (const [key, value] of Object.entries(input.planFeatures ?? {})) {
    if (value === false && features[key] === true) features[key] = false
  }

  const limits: EntitlementLimits = { ...UNLIMITED_LIMITS, ...(input.planLimits ?? {}) }
  if (!limits.allowMultipleLocations && features.multiLocation) features.multiLocation = false

  return { modules, features, limits }
}
