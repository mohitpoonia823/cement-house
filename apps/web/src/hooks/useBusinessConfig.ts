import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

function stateCodeFromGstin(gstin?: string | null) {
  const trimmed = String(gstin ?? '').trim()
  const match = trimmed.match(/^(\d{2})[A-Za-z0-9]{13}$/)
  return match ? match[1] : null
}

export function useBusinessConfig() {
  const { user } = useAuthStore()
  const bootstrap = useQuery({
    queryKey: ['settings-bootstrap'],
    queryFn: () => api.get('/api/settings/bootstrap').then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: Boolean(user?.businessId),
  })

  const featureFlags =
    (bootstrap.data?.settings?.business?.featureFlags as Record<string, boolean> | undefined)
    ?? user?.featureFlags
    ?? {}
  const businessGstin =
    (bootstrap.data?.settings?.business?.gstin as string | undefined | null)
    ?? null
  const explicitStateCode =
    (bootstrap.data?.settings?.business?.stateCode as string | undefined | null)
    ?? null

  return {
    gstBilling: featureFlags.gstBilling === true,
    storeStateCode: explicitStateCode || stateCodeFromGstin(businessGstin),
    isLoading: bootstrap.isLoading,
  }
}

export function getStateCodeFromGstin(gstin?: string | null) {
  return stateCodeFromGstin(gstin)
}
