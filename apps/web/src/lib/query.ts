import type { QueryClient } from '@tanstack/react-query'

export const QUERY_DEFAULTS = {
  staleTime: 30_000,
  retry: 1,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
} as const

export function invalidateBusinessData(qc: QueryClient, domains: Array<'orders' | 'inventory' | 'ledger' | 'customers' | 'dashboard' | 'deliveries' | 'reports' | 'locations' | 'stock-by-location' | 'stock-transfers' | 'reminders' | 'staff'>) {
  for (const key of domains) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}
