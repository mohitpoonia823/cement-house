import { useQuery } from '@tanstack/react-query'
import { api }      from '../lib/api'

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => api.get('/api/reports/dashboard').then(r => r.data.data),
    refetchInterval: 60_000,  // auto-refresh every 60s
  })
}
