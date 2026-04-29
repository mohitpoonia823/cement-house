import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn:  () => api.get('/api/inventory').then(r => r.data.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useStockIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/inventory/stock-in', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useStockAdjust() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/inventory/adjust', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })
}

export function useCreateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/inventory', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/inventory/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useBulkDeleteMaterials() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/api/inventory/bulk-delete', { ids }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function usePurchaseBillScans(limit = 100, search = '') {
  return useQuery({
    queryKey: ['inventory-bill-scans', limit, search],
    queryFn: () => api.get('/api/inventory/bill-scans', { params: { limit, search: search || undefined } }).then(r => r.data.data),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useScanPurchaseBill() {
  return useMutation({
    mutationFn: (data: { fileName?: string; dataUrl: string }) =>
      api.post('/api/inventory/bill-scans', data, { timeout: 60_000 }).then(r => r.data.data),
  })
}

export function useCommitPurchaseBillScan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scanId, lines }: { scanId: string; lines: any[] }) =>
      api.post(`/api/inventory/bill-scans/${scanId}/commit`, { lines }, { timeout: 30_000 }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
    },
  })
}
