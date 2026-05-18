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
  const orderFormConfig = useQuery({
    queryKey: ['settings-order-form'],
    queryFn: () => api.get('/api/settings/order-form').then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled: Boolean(user?.businessId),
  })

  const featureFlags =
    (orderFormConfig.data?.business?.featureFlags as Record<string, boolean> | undefined)
    ?? user?.featureFlags
    ?? {}
  const businessGstin =
    (orderFormConfig.data?.business?.gstin as string | undefined | null)
    ?? null
  const explicitStateCode =
    (orderFormConfig.data?.business?.stateCode as string | undefined | null)
    ?? null

  return {
    gstBilling: featureFlags.gstBilling === true,
    storeStateCode: explicitStateCode || stateCodeFromGstin(businessGstin),
    isLoading: orderFormConfig.isLoading,
  }
}

export function getStateCodeFromGstin(gstin?: string | null) {
  return stateCodeFromGstin(gstin)
}
