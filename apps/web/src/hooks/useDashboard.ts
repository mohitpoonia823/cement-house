import { useQuery } from '@tanstack/react-query'
import { api }      from '../lib/api'

interface DashboardQueryInput {
  range?: '7d' | '1m' | '2m' | '1y' | 'custom'
  startDate?: string
  endDate?: string
  recentOrdersLimit?: number
  topCustomersLimit?: number
  stockAlertsLimit?: number
}

export function useDashboard(params: DashboardQueryInput = {}) {
  return useQuery({
    queryKey: ['dashboard', params],
    queryFn:  () => api.get('/api/reports/dashboard', { params }).then(r => r.data.data),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      const status = Number(error?.response?.status ?? 0)
      if (status === 401 || status === 402 || status === 403) return false
      return failureCount < 1
    },
  })
}
