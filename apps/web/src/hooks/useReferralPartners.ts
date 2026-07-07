import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'


export function useReferralPartners(search?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['referral-partners', search ?? ''],
    queryFn: () => api.get('/api/referral-partners', { params: { search } }).then((r) => r.data.data),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useReferralLeaderboard(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['referral-partners', 'stats', params ?? {}],
    queryFn: () => api.get('/api/referral-partners/stats', { params }).then((r) => r.data.data),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateReferralPartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/referral-partners', data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-partners'] })
    },
  })
}

export function useUpdateReferralPartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/referral-partners/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-partners'] })
    },
  })
}

export function useDeleteReferralPartner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/referral-partners/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-partners'] })
    },
  })
}
