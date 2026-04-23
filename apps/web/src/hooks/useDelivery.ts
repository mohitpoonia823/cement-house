import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useDeliveries(filters?: { status?: string; date?: string }) {
  return useQuery({
    queryKey: ['deliveries', filters],
    queryFn:  () => api.get('/api/delivery', { params: filters }).then(r => r.data.data),
  })
}

export function useDelivery(id: string) {
  return useQuery({
    queryKey: ['deliveries', id],
    queryFn:  () => api.get(`/api/delivery/${id}`).then(r => r.data.data),
    enabled:  !!id,
  })
}

export function useTodayDeliveries() {
  return useQuery({
    queryKey: ['deliveries', 'today'],
    queryFn:  () => api.get('/api/delivery/today/summary').then(r => r.data.data),
    refetchInterval: 60_000,
  })
}

export function useCreateDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/delivery', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useConfirmDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/delivery/${id}/confirm`, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
