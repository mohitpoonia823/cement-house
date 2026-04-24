import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useStaff(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await api.get('/api/settings/staff')
      return res.data.data
    },
    enabled: options?.enabled ?? true,
  })
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: any) => api.post('/api/settings/staff', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] })
  })
}

export function useUpdateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & any) =>
      api.patch(`/api/settings/staff/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] })
  })
}

export function useDeleteStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/api/settings/staff/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] })
  })
}
