'use client'

import { useAuthStore } from '@/store/auth'
import {
  hasFeatureForUser,
  hasModuleForUser,
  type CapabilityFeatureKey,
  type CapabilityModuleKey,
} from '@/lib/tenant-capabilities'

export function useTenantCapabilities() {
  const { user } = useAuthStore()
  return {
    hasModule: (moduleKey: CapabilityModuleKey) => hasModuleForUser(user, moduleKey),
    hasFeature: (featureKey: CapabilityFeatureKey) => hasFeatureForUser(user, featureKey),
  }
}
