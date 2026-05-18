import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { invalidateBusinessData } from '@/lib/query'

export function useStaff(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await api.get('/api/settings/staff')
      return res.data.data
    },
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: any) => api.post('/api/settings/staff', data),
    onSuccess: () => invalidateBusinessData(qc, ['staff'])
  })
}

export function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
      api.patch(`/api/settings/staff/${id}`, data),
    onSuccess: () => invalidateBusinessData(qc, ['staff'])
  })
}

export function useDeleteStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/api/settings/staff/${id}`),
    onSuccess: () => invalidateBusinessData(qc, ['staff'])
  })
}
