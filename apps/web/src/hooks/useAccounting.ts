import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { invalidateBusinessData } from '@/lib/query'

export function useDayBook(filters?: { startDate?: string; endDate?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['accounting', 'day-book', filters],
    queryFn: () => api.get('/api/accounting/day-book', { params: filters }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useAccountLedger(accountId: string | null, filters?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['accounting', 'account-ledger', accountId, filters],
    queryFn: () => api.get('/api/accounting/account-ledger', { params: { accountId, ...filters } }).then((r) => r.data.data),
    enabled: !!accountId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useTrialBalance(filters?: { asOf?: string }) {
  return useQuery({
    queryKey: ['accounting', 'trial-balance', filters],
    queryFn: () => api.get('/api/accounting/trial-balance', { params: filters }).then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useExpenseAccounts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['accounting', 'expense-accounts'],
    queryFn: () => api.get('/api/accounting/expense-accounts').then((r) => r.data.data),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useExpenses() {
  return useQuery({
    queryKey: ['accounting', 'expenses'],
    queryFn: () => api.get('/api/accounting/expenses').then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

function invalidateAccounting(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['accounting'] })
  invalidateBusinessData(qc, ['dashboard'])
}

export function useRecordExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/accounting/expenses', data, { timeout: 60_000 }).then((r) => r.data.data),
    onSuccess: () => invalidateAccounting(qc),
  })
}

export function useRecordContra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/accounting/contra', data, { timeout: 60_000 }).then((r) => r.data.data),
    onSuccess: () => invalidateAccounting(qc),
  })
}

type Period = { startDate?: string; endDate?: string }

function reportQuery(path: string, key: string, params?: Record<string, string | undefined>) {
  return {
    queryKey: ['accounting', key, params],
    queryFn: () => api.get(`/api/accounting/${path}`, { params }).then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  }
}

export function useProfitLoss(period?: Period) {
  return useQuery(reportQuery('profit-loss', 'profit-loss', period))
}

export function useBalanceSheet(asOf?: string) {
  return useQuery(reportQuery('balance-sheet', 'balance-sheet', { asOf }))
}

export function usePayablesAging(asOf?: string) {
  return useQuery(reportQuery('payables-aging', 'payables-aging', { asOf }))
}

export function useGstr1(period?: Period) {
  return useQuery(reportQuery('gstr1', 'gstr1', period))
}

export function useGstr3b(period?: Period) {
  return useQuery(reportQuery('gstr3b', 'gstr3b', period))
}

export function useBackfillLedger() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/accounting/backfill', {}, { timeout: 120_000 }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting'] }),
  })
}

export function useReconciliation() {
  return useQuery(reportQuery('reconciliation', 'reconciliation'))
}

export function useOpeningBalances() {
  return useQuery(reportQuery('opening-balances', 'opening-balances'))
}

export function useSetOpeningBalance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { account: 'Cash' | 'Bank'; amount: number }) =>
      api.post('/api/accounting/opening-balances', data, { timeout: 60_000 }).then((r) => r.data.data),
    onSuccess: () => invalidateAccounting(qc),
  })
}
