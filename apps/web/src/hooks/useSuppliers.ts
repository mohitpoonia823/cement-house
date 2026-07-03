import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { invalidateBusinessData } from '@/lib/query'

export function useSuppliers(filters?: { search?: string }) {
  return useQuery({
    queryKey: ['suppliers', filters],
    queryFn: () => api.get('/api/suppliers', { params: filters }).then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: ['suppliers', id],
    queryFn: () => api.get(`/api/suppliers/${id}`).then((r) => r.data.data),
    enabled: !!id,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

// First write for a business seeds the chart of accounts (many round-trips on a
// remote DB), so give these accounting mutations a longer client timeout than
// the axios 15s default.
const ACCT_TIMEOUT = { timeout: 60_000 }

export function useCreateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/suppliers', data, ACCT_TIMEOUT).then((r) => r.data.data),
    onSuccess: () => invalidateBusinessData(qc, ['suppliers']),
  })
}

export function useUpdateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/suppliers/${id}`, data).then((r) => r.data.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['suppliers', v.id] })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/suppliers/${id}`).then((r) => r.data),
    onSuccess: () => invalidateBusinessData(qc, ['suppliers']),
  })
}

export function useRecordSupplierPurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ supplierId, ...data }: any) =>
      api.post(`/api/suppliers/${supplierId}/purchases`, data, ACCT_TIMEOUT).then((r) => r.data.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['suppliers', v.supplierId] })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
    },
  })
}

export function useRecordSupplierPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ supplierId, ...data }: any) =>
      api.post(`/api/suppliers/${supplierId}/payment`, data, ACCT_TIMEOUT).then((r) => r.data.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['suppliers', v.supplierId] })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      invalidateBusinessData(qc, ['dashboard'])
    },
  })
}
