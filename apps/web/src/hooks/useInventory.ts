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

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/api/locations').then((r) => r.data.data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/locations', data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      qc.invalidateQueries({ queryKey: ['stock-by-location'] })
    },
  })
}

export function useUpdateLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/locations/${id}`, data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      qc.invalidateQueries({ queryKey: ['stock-by-location'] })
    },
  })
}

export function useStockByLocation(locationId?: string) {
  return useQuery({
    queryKey: ['stock-by-location', locationId ?? 'all'],
    queryFn: () => api.get('/api/inventory/stock-by-location', { params: { locationId } }).then((r) => r.data.data),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useCreateStockTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.post('/api/stock-transfers', data).then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['stock-by-location'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useStockTransfers(limit = 50) {
  return useQuery({
    queryKey: ['stock-transfers', limit],
    queryFn: () => api.get('/api/stock-transfers', { params: { limit } }).then((r) => r.data.data),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useUpdateMaterial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/api/inventory/${id}`, data).then((r) => r.data.data),
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
