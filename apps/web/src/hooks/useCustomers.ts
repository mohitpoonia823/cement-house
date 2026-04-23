import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useCustomers(filters?: { search?: string; riskTag?: string }) {
  return useQuery({
    queryKey: ['customers', filters],
    queryFn:  () => api.get('/api/customers', { params: filters }).then(r => r.data.data),
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn:  () => api.get(`/api/customers/${id}`).then(r => r.data.data),
    enabled:  !!id,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/customers', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/customers/${id}`, data).then(r => r.data.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['customers', v.id] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/customers/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['ledger'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useBulkDeleteCustomers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/api/customers/bulk-delete', { ids }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['ledger'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useSendReminders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (customerIds: string[]) => api.post('/api/reminders/send-selected', { customerIds }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] })
    },
  })
}

