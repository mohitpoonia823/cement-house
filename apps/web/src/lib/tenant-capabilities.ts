import type { AuthUser } from '@/store/auth'
import {
  hasFeature as hasFeatureRaw,
  hasModule as hasModuleRaw,
  type FeatureKey,
  type ModuleKey,
} from '@cement-house/utils'

export type CapabilityModuleKey = ModuleKey | 'delivery' | 'transport'
export type CapabilityFeatureKey =
  | FeatureKey
  | 'transportManagement'
  | 'weightBasedBilling'
  | 'restaurantPOS'
  | 'barcodeSupport'

const MODULE_ALIAS_MAP: Partial<Record<CapabilityModuleKey, ModuleKey[]>> = {
  delivery: ['deliveries', 'logistics'],
  transport: ['logistics', 'deliveries'],
}

const FEATURE_ALIAS_MAP: Partial<Record<CapabilityFeatureKey, FeatureKey[]>> = {
  transportManagement: ['transport', 'deliveryChallan'],
  weightBasedBilling: ['weightBilling'],
  restaurantPOS: ['tableManagement', 'kot', 'kitchenOrders'],
  barcodeSupport: ['barcode'],
}

export function hasModule(
  enabledModules: readonly string[] | null | undefined,
  moduleKey: CapabilityModuleKey,
): boolean {
  const aliases = MODULE_ALIAS_MAP[moduleKey]
  if (aliases) return aliases.some((key) => hasModuleRaw(enabledModules, key))
  return hasModuleRaw(enabledModules, moduleKey as ModuleKey)
}

export function hasFeature(
  featureFlags: Record<string, boolean> | null | undefined,
  featureKey: CapabilityFeatureKey,
): boolean {
  const aliases = FEATURE_ALIAS_MAP[featureKey]
  if (aliases) return aliases.some((key) => hasFeatureRaw(featureFlags, key))
  return hasFeatureRaw(featureFlags, featureKey as FeatureKey)
}

export function hasModuleForUser(
  user: AuthUser | null | undefined,
  moduleKey: CapabilityModuleKey,
): boolean {
  return hasModule(user?.enabledModules, moduleKey)
}

export function hasFeatureForUser(
  user: AuthUser | null | undefined,
  featureKey: CapabilityFeatureKey,
): boolean {
  return hasFeature(user?.featureFlags, featureKey)
}
