import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLedger(customerId: string) {
  return useQuery({
    queryKey: ['ledger', customerId],
    queryFn:  () => api.get(`/api/ledger/${customerId}`).then(r => r.data.data),
    enabled:  !!customerId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useLedgerSummary() {
  return useQuery({
    queryKey: ['ledger', 'summary'],
    queryFn:  () => api.get('/api/ledger/summary/all').then(r => r.data.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/ledger/payment', data).then(r => r.data.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ledger', vars.customerId] })
      qc.invalidateQueries({ queryKey: ['ledger', 'summary'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
