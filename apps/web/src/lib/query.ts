import type { QueryClient } from '@tanstack/react-query'

export const QUERY_DEFAULTS = {
  staleTime: 30_000,
  retry: 1,
  // Refetch on mount only when the data is actually stale — which `staleTime`
  // already limits to once every 30s, so this is not a refetch storm.
  //
  // It must not be `false`. Mutations happen on their own routes (creating an
  // order navigates to /orders/new), so the list query is unmounted and
  // inactive when `invalidateQueries` runs: it gets marked stale, but the
  // `type: 'active'` refetch has no observer to act on. With `false`, mounting
  // the list again served the stale cache and never refetched, so a new order
  // stayed invisible until a hard reload built a fresh QueryClient.
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
} as const

export function invalidateBusinessData(qc: QueryClient, domains: Array<'orders' | 'inventory' | 'ledger' | 'customers' | 'dashboard' | 'deliveries' | 'reports' | 'locations' | 'stock-by-location' | 'stock-transfers' | 'reminders' | 'staff' | 'suppliers'>) {
  for (const key of domains) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}
