'use client'
import { AppShell }    from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader }  from '@/components/ui/Spinner'
import {
  useInventory,
  useStockIn,
  useCreateMaterial,
  useUpdateMaterial,
  useDeleteMaterial,
  useBulkDeleteMaterials,
  useLocations,
  useStockByLocation,
  useCreateStockTransfer,
  useBackfillLocationStock,
} from '@/hooks/useInventory'
import { fmt }         from '@/lib/utils'
import { Suspense, type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState }    from 'react'
import { useQuery, useQueryClient }    from '@tanstack/react-query'
import { api }         from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { BillScanPanel } from '@/components/inventory/BillScanPanel'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { useAuthStore } from '@/store/auth'
import { businessTerms, businessUnitOptions, splitPreferredUnits } from '@/lib/business-terms'
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function useMovements(materialId: string) {
  return useQuery({
    queryKey: ['movements', materialId],
    queryFn:  () => api.get(`/api/inventory/${materialId}/movements`).then(r => r.data.data),
    enabled:  !!materialId,
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

function sanitizeMaterialPayload(
  payload: Record<string, any>,
  capabilities?: {
    canBarcode?: boolean
    canBatch?: boolean
    canExpiry?: boolean
    canSerial?: boolean
    canVariants?: boolean
    canWeight?: boolean
    canJewellery?: boolean
    canStorage?: boolean
  }
) {
  const next = { ...payload }
  const optionalStringFields = [
    'category',
    'barcode',
    'batchNumber',
    'expiryDate',
    'manufactureDate',
    'manufacturer',
    'rackLocation',
    'size',
    'color',
    'material',
    'serialNumber',
    'imeiNumber',
  ]
  const optionalNumberFields = ['weight', 'purity', 'makingCharges', 'grossWeight', 'tareWeight', 'netWeight']

  for (const key of optionalStringFields) {
    if (typeof next[key] === 'string') {
      const trimmed = next[key].trim()
      if (!trimmed) delete next[key]
      else next[key] = trimmed
    }
  }
  for (const key of optionalNumberFields) {
    if (next[key] === '' || next[key] == null || Number.isNaN(next[key])) delete next[key]
  }

  if (capabilities) {
    if (!capabilities.canBarcode) delete next.barcode
    if (!capabilities.canBatch) delete next.batchNumber
    if (!capabilities.canExpiry) {
      delete next.expiryDate
      delete next.manufactureDate
      delete next.allowPastExpiry
    }
    if (!capabilities.canSerial) {
      delete next.serialNumber
      delete next.imeiNumber
    }
    if (!capabilities.canVariants) {
      delete next.size
      delete next.color
      delete next.material
    }
    if (!capabilities.canWeight) {
      delete next.weight
      delete next.grossWeight
      delete next.tareWeight
      delete next.netWeight
    }
    if (!capabilities.canJewellery) {
      delete next.purity
      delete next.makingCharges
    }
    if (!capabilities.canStorage) {
      delete next.manufacturer
      delete next.rackLocation
    }
  }
  return next
}

function parseMaterialError(err: any, fallback: string) {
  if (err instanceof SyntaxError) return 'Invalid metadata JSON'
  const raw = err?.response?.data?.error
  if (Array.isArray(raw)) {
    const fields = raw
      .map((issue: any) => String(issue?.path?.[0] ?? '').trim())
      .filter(Boolean)
    if (fields.length > 0) return `Please check: ${[...new Set(fields)].join(', ')}`
  }
  return raw ?? fallback
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <InventoryContent />
    </Suspense>
  )
}

function InventoryContent() {
  const qc = useQueryClient()
  const { pushToast } = useFeedback()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const { hasModule, hasFeature } = useTenantCapabilities()
  const canUseInventory = hasModule('inventory')
  const canBarcode = hasFeature('barcodeSupport')
  const canBatch = hasFeature('batchTracking')
  const canExpiry = hasFeature('expiryTracking')
  const canSerial = hasFeature('serialTracking')
  const canWeight = hasFeature('weightBasedBilling')
  const canVariants = hasFeature('variants')
  const canJewellery = hasFeature('weightBasedBilling') || hasFeature('makingCharges') || hasFeature('purityTracking')
  const canStorage = hasFeature('rackLocation')
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) => (language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en)
  const terms = businessTerms(user?.businessType as any, user?.customLabels as any)
  const unitPreset = businessUnitOptions(user?.businessType as any)
  const { data: materials, isLoading } = useInventory()
  const { data: locations } = useLocations()
  const [stockLocationFilterId, setStockLocationFilterId] = useState('')
  const { data: stockByLocation } = useStockByLocation(stockLocationFilterId || undefined)
  const createTransfer = useCreateStockTransfer()
  const backfillLocationStock = useBackfillLocationStock()
  const stockIn        = useStockIn()
  const createMaterial = useCreateMaterial()
  const updateMaterial = useUpdateMaterial()
  const deleteMaterial = useDeleteMaterial()
  const bulkDelete     = useBulkDeleteMaterials()

  const [selectedId,  setSelectedId]  = useState('')
  const [showStockIn, setShowStockIn] = useState(false)
  const [showAddNew,  setShowAddNew]  = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showBillScan, setShowBillScan] = useState(false)
  const [billImportMessage, setBillImportMessage] = useState('')
  const [siQty,   setSiQty]   = useState('')
  const [siPrice, setSiPrice] = useState('')
  const [siNote,  setSiNote]  = useState('')
  const [siError, setSiError] = useState('')
  const stockInPanelRef = useRef<HTMLDivElement | null>(null)
  const inventoryContentRef = useRef<HTMLDivElement | null>(null)
  const addNewFormRef = useRef<HTMLDivElement | null>(null)
  const addNewNameInputRef = useRef<HTMLInputElement | null>(null)
  const billScanPanelRef = useRef<HTMLDivElement | null>(null)

  // New material form
  const [newForm, setNewForm] = useState({
    name: '', category: '', unit: unitPreset.defaultUnit, stockQty: '', minThreshold: '', maxThreshold: '', purchasePrice: '', salePrice: '',
    barcode: '', batchNumber: '', expiryDate: '', manufactureDate: '', manufacturer: '', rackLocation: '',
    size: '', color: '', material: '', weight: '', purity: '', makingCharges: '', serialNumber: '', imeiNumber: '',
    grossWeight: '', tareWeight: '', netWeight: '', metadataText: '{}', allowPastExpiry: false
  })
  const [editForm, setEditForm] = useState({
    id: '', name: '', category: '', unit: unitPreset.defaultUnit, stockQty: '', minThreshold: '', maxThreshold: '', purchasePrice: '', salePrice: '',
    barcode: '', batchNumber: '', expiryDate: '', manufactureDate: '', manufacturer: '', rackLocation: '',
    size: '', color: '', material: '', weight: '', purity: '', makingCharges: '', serialNumber: '', imeiNumber: '',
    grossWeight: '', tareWeight: '', netWeight: '', metadataText: '{}', allowPastExpiry: false
  })
  const [newError, setNewError] = useState('')
  const [editError, setEditError] = useState('')
  const [transferFromLocationId, setTransferFromLocationId] = useState('')
  const [transferToLocationId, setTransferToLocationId] = useState('')
  const [transferMaterialId, setTransferMaterialId] = useState('')
  const [transferQty, setTransferQty] = useState('')
  const [transferError, setTransferError] = useState('')
  const [backfillMessage, setBackfillMessage] = useState('')
  const [bulkTransferMode, setBulkTransferMode] = useState(false)
  const [bulkTransferQty, setBulkTransferQty] = useState<Record<string, string>>({})
  const openedFromScanIntent = useRef(false)
  const transferPanelRef = useRef<HTMLDivElement | null>(null)
  const { data: sourceStockByLocation } = useStockByLocation(transferFromLocationId || undefined)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    mode: 'single' | 'bulk'
    id?: string
    name?: string
    ids?: string[]
  }>({ open: false, mode: 'single' })
  const list = materials ?? []
  const initialLoading = isLoading && !materials
  const unitOptions = useMemo(() => {
    const merged = [...unitPreset.all, ...list.map((m: any) => String(m.unit ?? '').trim()).filter(Boolean)]
    const seen = new Set<string>()
    return merged.filter((unit) => {
      const key = unit.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [list, unitPreset.all])
  const { preferred: preferredUnits, others: otherUnits } = useMemo(
    () => splitPreferredUnits(unitOptions, unitPreset.preferred),
    [unitOptions, unitPreset.preferred]
  )
  const allSelected = list.length > 0 && selected.size === list.length
  const activeLocations = (locations ?? []).filter((loc: any) => loc.isActive)
  const availableTransferQty = useMemo(() => {
    if (!transferFromLocationId || !transferMaterialId) return 0
    const row = (sourceStockByLocation ?? []).find(
      (entry: any) => entry.locationId === transferFromLocationId && entry.materialId === transferMaterialId
    )
    return Number(row?.quantity ?? 0)
  }, [sourceStockByLocation, transferFromLocationId, transferMaterialId])
  const defaultLocation = useMemo(
    () => activeLocations.find((loc: any) => loc.isDefault) ?? activeLocations[0] ?? null,
    [activeLocations]
  )
  const selectedMaterials = useMemo(
    () => list.filter((m: any) => selected.has(m.id)),
    [list, selected]
  )

  function buildDefaultBulkTransferQty(sourceLocationId: string, materialsForTransfer: any[]) {
    return Object.fromEntries(
      materialsForTransfer.map((material: any) => {
        const available = Number((sourceStockByLocation ?? []).find(
          (entry: any) => entry.locationId === sourceLocationId && entry.materialId === material.id
        )?.quantity ?? 0)
        return [material.id, available > 0 ? String(Number(available.toFixed(3))) : '']
      })
    ) as Record<string, string>
  }
  useEffect(() => {
    if (selectedMaterials.length === 0 && bulkTransferMode) {
      setBulkTransferMode(false)
      setBulkTransferQty({})
    }
  }, [bulkTransferMode, selectedMaterials.length])

  useEffect(() => {
    setNewForm((prev) => {
      const hasCurrent = unitOptions.some((u) => u.toLowerCase() === String(prev.unit).toLowerCase())
      if (hasCurrent) return prev
      return { ...prev, unit: unitPreset.defaultUnit }
    })
  }, [unitOptions, unitPreset.defaultUnit])

  useEffect(() => {
    if (openedFromScanIntent.current) return
    const hasScanHash = typeof window !== 'undefined' && window.location.hash === '#scan-bill'
    const shouldOpenScanner = searchParams.get('scanBill') === '1' || hasScanHash
    if (!shouldOpenScanner) return
    openedFromScanIntent.current = true
    setShowBillScan(true)
    setShowAddNew(false)
    setTimeout(() => {
      billScanPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      params.delete('scanBill')
      const nextQuery = params.toString()
      const nextPath = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`
      window.history.replaceState({}, '', nextPath)
    }
  }, [searchParams])

  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(list.map((m: any) => m.id)))
  }

  const { data: movements } = useMovements(selectedId)

  async function handleStockIn(e: React.FormEvent) {
    e.preventDefault(); setSiError('')
    try {
      await stockIn.mutateAsync({ materialId: selectedId, quantity: Number(siQty), purchasePrice: Number(siPrice), reason: siNote || 'Purchase' })
      setShowStockIn(false); setSiQty(''); setSiPrice(''); setSiNote('')
    } catch (err: any) { setSiError(err.response?.data?.error ?? 'Failed') }
  }

  async function handleCreateMaterial(e: React.FormEvent) {
    e.preventDefault(); setNewError('')
    try {
      let metadata: Record<string, unknown> | undefined
      if (newForm.metadataText.trim()) {
        metadata = JSON.parse(newForm.metadataText)
      }
      const payload: any = {
        ...newForm,
        stockQty: Number(newForm.stockQty || 0),
        minThreshold: Number(newForm.minThreshold || 0),
        maxThreshold: newForm.maxThreshold === '' ? undefined : Number(newForm.maxThreshold),
        purchasePrice: Number(newForm.purchasePrice || 0),
        salePrice: Number(newForm.salePrice || 0),
        metadata,
      }
      if (newForm.weight) payload.weight = Number(newForm.weight)
      if (newForm.purity) payload.purity = Number(newForm.purity)
      if (newForm.makingCharges) payload.makingCharges = Number(newForm.makingCharges)
      if (newForm.grossWeight) payload.grossWeight = Number(newForm.grossWeight)
      if (newForm.tareWeight) payload.tareWeight = Number(newForm.tareWeight)
      if (newForm.netWeight) payload.netWeight = Number(newForm.netWeight)
      else if (newForm.grossWeight && newForm.tareWeight) {
        payload.netWeight = Math.max(0, Number(newForm.grossWeight) - Number(newForm.tareWeight))
      }
      await createMaterial.mutateAsync(sanitizeMaterialPayload(payload, {
        canBarcode,
        canBatch,
        canExpiry,
        canSerial,
        canVariants,
        canWeight,
        canJewellery,
        canStorage,
      }))
      setShowAddNew(false)
      setNewForm({
        name: '', category: '', unit: unitPreset.defaultUnit, stockQty: '', minThreshold: '', maxThreshold: '', purchasePrice: '', salePrice: '',
        barcode: '', batchNumber: '', expiryDate: '', manufactureDate: '', manufacturer: '', rackLocation: '',
        size: '', color: '', material: '', weight: '', purity: '', makingCharges: '', serialNumber: '', imeiNumber: '',
        grossWeight: '', tareWeight: '', netWeight: '', metadataText: '{}', allowPastExpiry: false
      })
    } catch (err: any) {
      const message = parseMaterialError(err, `Failed to create ${terms.material.toLowerCase()}`)
      setNewError(message)
    }
  }

  async function handleUpdateMaterial(e: React.FormEvent) {
    e.preventDefault(); setEditError('')
    try {
      let metadata: Record<string, unknown> | undefined
      if (editForm.metadataText.trim()) {
        metadata = JSON.parse(editForm.metadataText)
      }
      const payload: any = {
        ...editForm,
        stockQty: Number(editForm.stockQty || 0),
        minThreshold: Number(editForm.minThreshold || 0),
        maxThreshold: editForm.maxThreshold === '' ? undefined : Number(editForm.maxThreshold),
        purchasePrice: Number(editForm.purchasePrice || 0),
        salePrice: Number(editForm.salePrice || 0),
        metadata,
      }
      if (editForm.weight) payload.weight = Number(editForm.weight)
      if (editForm.purity) payload.purity = Number(editForm.purity)
      if (editForm.makingCharges) payload.makingCharges = Number(editForm.makingCharges)
      if (editForm.grossWeight) payload.grossWeight = Number(editForm.grossWeight)
      if (editForm.tareWeight) payload.tareWeight = Number(editForm.tareWeight)
      if (editForm.netWeight) payload.netWeight = Number(editForm.netWeight)
      else if (editForm.grossWeight && editForm.tareWeight) {
        payload.netWeight = Math.max(0, Number(editForm.grossWeight) - Number(editForm.tareWeight))
      }
      await updateMaterial.mutateAsync(sanitizeMaterialPayload(payload, {
        canBarcode,
        canBatch,
        canExpiry,
        canSerial,
        canVariants,
        canWeight,
        canJewellery,
        canStorage,
      }))
      setShowEdit(false)
    } catch (err: any) {
      const message = parseMaterialError(err, `Failed to update ${terms.material.toLowerCase()}`)
      setEditError(message)
    }
  }

  function handleDelete(id: string, name: string) {
    setDeleteConfirm({ open: true, mode: 'single', id, name })
  }

  function handleBulkDelete() {
    if (selected.size === 0) return
    setDeleteConfirm({ open: true, mode: 'bulk', ids: [...selected] })
  }

  function closeDeleteConfirm() {
    if (deleteMaterial.isPending || bulkDelete.isPending) return
    setDeleteConfirm({ open: false, mode: 'single' })
  }

  function confirmDelete() {
    if (deleteConfirm.mode === 'single' && deleteConfirm.id) {
      const id = deleteConfirm.id
      deleteMaterial.mutate(id, {
        onSuccess: () => {
          setSelected((prev) => {
            const n = new Set(prev)
            n.delete(id)
            return n
          })
          if (selectedId === id) setSelectedId('')
          setDeleteConfirm({ open: false, mode: 'single' })
        },
      })
      return
    }

    if (deleteConfirm.mode === 'bulk' && deleteConfirm.ids && deleteConfirm.ids.length > 0) {
      const ids = deleteConfirm.ids
      bulkDelete.mutate(ids, {
        onSuccess: () => {
          setSelected(new Set())
          if (selected.has(selectedId)) setSelectedId('')
          setDeleteConfirm({ open: false, mode: 'single' })
        },
      })
    }
  }

  const selectedMat = list.find((m: any) => m.id === selectedId)

  function openAddItemForm() {
    setShowAddNew(true)
    setShowBillScan(false)
    setBillImportMessage('')
    setTimeout(() => {
      addNewFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      addNewNameInputRef.current?.focus()
    }, 40)
  }

  async function handleCreateTransfer(e: React.FormEvent) {
    e.preventDefault()
    setTransferError('')
    try {
      if (!transferFromLocationId || !transferToLocationId) {
        setTransferError('Select source and destination locations.')
        return
      }
      if (transferFromLocationId === transferToLocationId) {
        setTransferError('Source and destination location cannot be same.')
        return
      }
      if (bulkTransferMode) {
        const items: Array<{ materialId: string; quantity: number; available: number }> = selectedMaterials
          .map((material: any) => {
            const qty = Number(bulkTransferQty[material.id] ?? 0)
            const available = Number((sourceStockByLocation ?? []).find(
              (entry: any) => entry.locationId === transferFromLocationId && entry.materialId === material.id
            )?.quantity ?? 0)
            return { materialId: material.id, quantity: qty, available }
          })
          .filter((item: { materialId: string; quantity: number; available: number }) => item.quantity > 0)
        if (items.length === 0) {
          setTransferError('Enter quantity for at least one selected item.')
          return
        }
        const invalid = items.find((item) => item.quantity > item.available)
        if (invalid) {
          setTransferError('One or more transfer quantities exceed source stock.')
          return
        }
        await createTransfer.mutateAsync({
          fromLocationId: transferFromLocationId,
          toLocationId: transferToLocationId,
          items: items.map(({ materialId, quantity }) => ({ materialId, quantity })),
        })
        const previousToLocationId = transferToLocationId
        setBulkTransferQty({})
        setBulkTransferMode(false)
        setSelected(new Set())
        if (previousToLocationId) {
          setTransferFromLocationId(previousToLocationId)
        }
        setTransferToLocationId('')
        setTransferError('')
        pushToast(`Stock transferred for ${items.length} material(s).`, 'success')
        return
      }
      if (!transferMaterialId || Number(transferQty) <= 0) {
        setTransferError('Select material and valid quantity.')
        return
      }
      if (Number(transferQty) > availableTransferQty) {
        setTransferError(`Transfer quantity exceeds available stock (${availableTransferQty.toFixed(3)}).`)
        return
      }
      await createTransfer.mutateAsync({
        fromLocationId: transferFromLocationId,
        toLocationId: transferToLocationId,
        items: [{ materialId: transferMaterialId, quantity: Number(transferQty) }],
      })
      const previousToLocationId = transferToLocationId
      setTransferQty('')
      setTransferMaterialId('')
      if (previousToLocationId) {
        setTransferFromLocationId(previousToLocationId)
      }
      setTransferToLocationId('')
      setTransferError('')
      pushToast('Stock transferred successfully.', 'success')
    } catch (err: any) {
      const backendMessage =
        err?.response?.data?.error
        ?? err?.response?.data?.message
        ?? err?.message
        ?? 'Failed to create stock transfer'
      const normalized = String(backendMessage).toLowerCase()
      const isTimeoutLike = normalized.includes('timeout') || normalized.includes('canceled') || normalized.includes('cancelled')
      if (isTimeoutLike) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stock-by-location'] }),
          qc.invalidateQueries({ queryKey: ['inventory'] }),
          qc.invalidateQueries({ queryKey: ['stock-transfers'] }),
          qc.invalidateQueries({ queryKey: ['dashboard'] }),
        ])
        setTransferError('Request timed out on UI, but transfer may be completed. Data has been refreshed.')
        pushToast('Request timed out on UI. Stock was refreshed; transfer may already be completed.', 'info')
        return
      }
      setTransferError(String(backendMessage))
    }
  }

  function startBulkTransferFromSelection() {
    if (selectedMaterials.length === 0) return
    const sourceId = transferFromLocationId || defaultLocation?.id || ''
    setBulkTransferMode(true)
    setTransferMaterialId('')
    setTransferQty('')
    setTransferError('')
    if (!transferFromLocationId && defaultLocation?.id) setTransferFromLocationId(defaultLocation.id)
    if (sourceId) {
      setBulkTransferQty(buildDefaultBulkTransferQty(sourceId, selectedMaterials))
    } else {
      setBulkTransferQty(Object.fromEntries(selectedMaterials.map((material: any) => [material.id, ''])))
    }
    setTimeout(() => transferPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  useEffect(() => {
    if (!bulkTransferMode || !transferFromLocationId || selectedMaterials.length === 0) return
    setBulkTransferQty(buildDefaultBulkTransferQty(transferFromLocationId, selectedMaterials))
  }, [bulkTransferMode, transferFromLocationId, selectedMaterials.length, sourceStockByLocation])

  async function handleBackfillLocationStock() {
    setBackfillMessage('')
    try {
      const result = await backfillLocationStock.mutateAsync()
      setBackfillMessage(
        `Mapped ${result.mappedMaterialCount} material(s), added ${Number(result.totalQuantityAdded).toFixed(3)} units to default location.`
      )
    } catch (err: any) {
      setBackfillMessage(err?.response?.data?.error ?? 'Failed to backfill location stock')
    }
  }

  useEffect(() => {
    if (!selectedMat) return
    setEditForm({
      id: selectedMat.id,
      name: selectedMat.name ?? '',
      category: selectedMat.category ?? '',
      unit: selectedMat.unit ?? unitPreset.defaultUnit,
      stockQty: String(selectedMat.stockQty ?? ''),
      minThreshold: String(selectedMat.minThreshold ?? ''),
      maxThreshold: selectedMat.maxThreshold == null ? '' : String(selectedMat.maxThreshold),
      purchasePrice: String(selectedMat.purchasePrice ?? ''),
      salePrice: String(selectedMat.salePrice ?? ''),
      barcode: selectedMat.barcode ?? '',
      batchNumber: selectedMat.batchNumber ?? '',
      expiryDate: selectedMat.expiryDate ? String(selectedMat.expiryDate).slice(0, 10) : '',
      manufactureDate: selectedMat.manufactureDate ? String(selectedMat.manufactureDate).slice(0, 10) : '',
      manufacturer: selectedMat.manufacturer ?? '',
      rackLocation: selectedMat.rackLocation ?? '',
      size: selectedMat.size ?? '',
      color: selectedMat.color ?? '',
      material: selectedMat.material ?? '',
      weight: selectedMat.weight == null ? '' : String(selectedMat.weight),
      purity: selectedMat.purity == null ? '' : String(selectedMat.purity),
      makingCharges: selectedMat.makingCharges == null ? '' : String(selectedMat.makingCharges),
      serialNumber: selectedMat.serialNumber ?? '',
      imeiNumber: selectedMat.imeiNumber ?? '',
      grossWeight: selectedMat.grossWeight == null ? '' : String(selectedMat.grossWeight),
      tareWeight: selectedMat.tareWeight == null ? '' : String(selectedMat.tareWeight),
      netWeight: selectedMat.netWeight == null ? '' : String(selectedMat.netWeight),
      metadataText: selectedMat.metadata ? JSON.stringify(selectedMat.metadata, null, 2) : '{}',
      allowPastExpiry: false,
    })
  }, [selectedMat, unitPreset.defaultUnit])

  useEffect(() => {
    if (!selectedId) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      const root = inventoryContentRef.current
      if (!target || !root) return
      if (!root.contains(target)) return
      const insideCard = (target as HTMLElement).closest('[data-material-card="true"]')
      const insidePanel = (target as HTMLElement).closest('[data-stock-panel="true"]')
      const insideToolbar = (target as HTMLElement).closest('[data-inventory-toolbar="true"]')
      if (insideCard || insidePanel || insideToolbar) return
      setSelectedId('')
      setShowStockIn(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [selectedId])

  const inputClass =
    'w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  const sectionTitleClass = 'text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-300'

  const renderScopedFields = (
    form: any,
    setForm: Dispatch<SetStateAction<any>>,
  ) => (
    <>
      <div className={sectionTitleClass}>Identification</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canBarcode ? (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Barcode</label>
            <input type="text" value={form.barcode} onChange={e => setForm((p: any) => ({ ...p, barcode: e.target.value }))} className={inputClass} />
          </div>
        ) : null}
        {canSerial ? (
          <>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Serial number</label>
              <input type="text" value={form.serialNumber} onChange={e => setForm((p: any) => ({ ...p, serialNumber: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">IMEI number</label>
              <input type="text" value={form.imeiNumber} onChange={e => setForm((p: any) => ({ ...p, imeiNumber: e.target.value }))} className={inputClass} />
            </div>
          </>
        ) : null}
      </div>

      {(canBatch || canExpiry) ? <div className={sectionTitleClass}>Batch & expiry</div> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canBatch ? (
          <div>
            <label className="block text-xs text-stone-500 mb-1">Batch number</label>
            <input type="text" value={form.batchNumber} onChange={e => setForm((p: any) => ({ ...p, batchNumber: e.target.value }))} className={inputClass} />
          </div>
        ) : null}
        {canExpiry ? (
          <>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Manufacture date</label>
              <input type="date" value={form.manufactureDate} onChange={e => setForm((p: any) => ({ ...p, manufactureDate: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Expiry date</label>
              <input type="date" value={form.expiryDate} onChange={e => setForm((p: any) => ({ ...p, expiryDate: e.target.value }))} className={inputClass} />
            </div>
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-stone-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(form.allowPastExpiry)}
                onChange={e => setForm((p: any) => ({ ...p, allowPastExpiry: e.target.checked }))}
                className="rounded border-stone-300 text-blue-600 focus:ring-blue-500"
              />
              Allow past expiry for existing/legacy stock
            </label>
          </>
        ) : null}
      </div>

      {canVariants ? <div className={sectionTitleClass}>Variants</div> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canVariants ? (
          <>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Size</label>
              <input type="text" value={form.size} onChange={e => setForm((p: any) => ({ ...p, size: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Color</label>
              <input type="text" value={form.color} onChange={e => setForm((p: any) => ({ ...p, color: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Material</label>
              <input type="text" value={form.material} onChange={e => setForm((p: any) => ({ ...p, material: e.target.value }))} className={inputClass} />
            </div>
          </>
        ) : null}
      </div>

      {canWeight ? <div className={sectionTitleClass}>Weight details</div> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canWeight ? (
          <>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Gross weight</label>
              <input type="number" min={0} step={0.01} value={form.grossWeight} onChange={e => setForm((p: any) => {
                const grossWeight = e.target.value
                const tare = Number(p.tareWeight || 0)
                const gross = Number(grossWeight || 0)
                const next: any = { ...p, grossWeight }
                if (!p.netWeight || p.netWeight === '' || Number.isFinite(Number(p.netWeight))) next.netWeight = grossWeight && p.tareWeight ? String(Math.max(0, gross - tare)) : p.netWeight
                return next
              })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Tare weight</label>
              <input type="number" min={0} step={0.01} value={form.tareWeight} onChange={e => setForm((p: any) => {
                const tareWeight = e.target.value
                const tare = Number(tareWeight || 0)
                const gross = Number(p.grossWeight || 0)
                const next: any = { ...p, tareWeight }
                if (!p.netWeight || p.netWeight === '' || Number.isFinite(Number(p.netWeight))) next.netWeight = p.grossWeight && tareWeight ? String(Math.max(0, gross - tare)) : p.netWeight
                return next
              })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Net weight</label>
              <input type="number" min={0} step={0.01} value={form.netWeight} onChange={e => setForm((p: any) => ({ ...p, netWeight: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Weight</label>
              <input type="number" min={0} step={0.01} value={form.weight} onChange={e => setForm((p: any) => ({ ...p, weight: e.target.value }))} className={inputClass} />
            </div>
          </>
        ) : null}
      </div>

      {canJewellery ? <div className={sectionTitleClass}>Jewellery details</div> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canJewellery ? (
          <>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Purity (%)</label>
              <input type="number" min={0} max={100} step={0.01} value={form.purity} onChange={e => setForm((p: any) => ({ ...p, purity: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Making charges</label>
              <input type="number" min={0} step={0.01} value={form.makingCharges} onChange={e => setForm((p: any) => ({ ...p, makingCharges: e.target.value }))} className={inputClass} />
            </div>
          </>
        ) : null}
      </div>

      {canStorage ? <div className={sectionTitleClass}>Storage details</div> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canStorage ? (
          <>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Manufacturer</label>
              <input type="text" value={form.manufacturer} onChange={e => setForm((p: any) => ({ ...p, manufacturer: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Rack location</label>
              <input type="text" value={form.rackLocation} onChange={e => setForm((p: any) => ({ ...p, rackLocation: e.target.value }))} className={inputClass} />
            </div>
          </>
        ) : null}
      </div>

      <div className={sectionTitleClass}>Metadata</div>
      <div>
        <label className="block text-xs text-stone-500 mb-1">Metadata (JSON)</label>
        <textarea rows={4} value={form.metadataText} onChange={e => setForm((p: any) => ({ ...p, metadataText: e.target.value }))} className={inputClass} />
      </div>
    </>
  )

  return (
    <AppShell>
      {!canUseInventory ? (
        <div ref={addNewFormRef}>
        <Card className="mb-4">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {language === 'hi' ? 'Ã Â¤Â¯Ã Â¤Â¹ Ã Â¤Â®Ã Â¥â€°Ã Â¤Â¡Ã Â¥ÂÃ Â¤Â¯Ã Â¥â€šÃ Â¤Â² Ã Â¤â€ Ã Â¤ÂªÃ Â¤â€¢Ã Â¥â€¡ Ã Â¤ÂªÃ Â¥ÂÃ Â¤Â²Ã Â¤Â¾Ã Â¤Â¨ Ã Â¤Â®Ã Â¥â€¡Ã Â¤â€š Ã Â¤Â¸Ã Â¤â€¢Ã Â¥ÂÃ Â¤Â·Ã Â¤Â® Ã Â¤Â¨Ã Â¤Â¹Ã Â¥â‚¬Ã Â¤â€š Ã Â¤Â¹Ã Â¥Ë†Ã Â¥Â¤' : 'This module is not enabled for your workspace.'}
          </div>
        </Card>
        </div>
      ) : null}
      {canUseInventory ? (
      <>
      <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm md:hidden dark:border-slate-700 dark:bg-slate-900/70">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          {language === 'hi' ? 'à¤‡à¤¨à¥à¤µà¥‡à¤‚à¤Ÿà¥à¤°à¥€ à¤à¤¨à¤¾à¤²à¤¿à¤Ÿà¤¿à¤•à¥à¤¸' : language === 'hinglish' ? 'Inventory analytics' : 'Inventory analytics'}
        </div>
        <h1 className="mt-1 text-2xl font-semibold leading-tight text-slate-950 dark:text-white">
          {language === 'hi' ? 'à¤‡à¤¨à¥à¤µà¥‡à¤‚à¤Ÿà¥à¤°à¥€ à¤¨à¤¿à¤¯à¤‚à¤¤à¥à¤°à¤£' : language === 'hinglish' ? `${terms.inventory} control` : `${terms.inventory} control`}
        </h1>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {language === 'hi' ? 'à¤¸à¥à¤Ÿà¥‰à¤•, à¤°à¥€à¤ªà¥à¤²à¥‡à¤¨à¤¿à¤¶à¤®à¥‡à¤‚à¤Ÿ à¤”à¤° à¤ªà¥à¤°à¤¾à¤‡à¤¸à¤¿à¤‚à¤— à¤•à¥‹ à¤à¤• à¤œà¤—à¤¹ à¤¸à¥‡ à¤®à¥ˆà¤¨à¥‡à¤œ à¤•à¤°à¥‡à¤‚à¥¤' : language === 'hinglish' ? 'Stock, replenishment aur pricing ek jagah manage karo.' : 'Balance stock health, replenishment activity, and pricing signals.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => { setShowBillScan(s => !s); setShowAddNew(false); setBillImportMessage('') }}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
            {showBillScan
              ? (language === 'hi' ? 'à¤¸à¥à¤•à¥ˆà¤¨à¤° à¤¬à¤‚à¤¦ à¤•à¤°à¥‡à¤‚' : language === 'hinglish' ? 'Scanner band karo' : 'Close scanner')
              : (language === 'hi' ? 'à¤¬à¤¿à¤² à¤¸à¥à¤•à¥ˆà¤¨ à¤•à¤°à¥‡à¤‚' : language === 'hinglish' ? 'Bill scan karo' : 'Scan bill')}
          </button>
          <button onClick={openAddItemForm}
            className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950">
            {language === 'hi' ? '+ à¤®à¤Ÿà¥‡à¤°à¤¿à¤¯à¤² à¤œà¥‹à¤¡à¤¼à¥‡à¤‚' : language === 'hinglish' ? `+ ${terms.material} add karo` : `+ Add ${terms.material.toLowerCase()}`}
          </button>
        </div>
      </div>

      <div className="hidden md:block">
      <SectionHeader
        eyebrow={language === 'hi' ? 'à¤‡à¤¨à¥à¤µà¥‡à¤‚à¤Ÿà¥à¤°à¥€ à¤à¤¨à¤¾à¤²à¤¿à¤Ÿà¤¿à¤•à¥à¤¸' : language === 'hinglish' ? 'Inventory analytics' : 'Inventory analytics'}
        title={language === 'hi' ? 'à¤‡à¤¨à¥à¤µà¥‡à¤‚à¤Ÿà¥à¤°à¥€ à¤¨à¤¿à¤¯à¤‚à¤¤à¥à¤°à¤£' : language === 'hinglish' ? `${terms.inventory} control` : `${terms.inventory} control`}
        description={language === 'hi' ? 'à¤¸à¥à¤Ÿà¥‰à¤•, à¤°à¥€à¤ªà¥à¤²à¥‡à¤¨à¤¿à¤¶à¤®à¥‡à¤‚à¤Ÿ à¤”à¤° à¤ªà¥à¤°à¤¾à¤‡à¤¸à¤¿à¤‚à¤— à¤•à¥‹ à¤à¤• à¤œà¤—à¤¹ à¤¸à¥‡ à¤®à¥ˆà¤¨à¥‡à¤œ à¤•à¤°à¥‡à¤‚à¥¤' : language === 'hinglish' ? 'Stock, replenishment aur pricing ek jagah manage karo.' : 'Balance stock health, replenishment activity, and pricing signals without losing the operational workflows.'}
        action={
          <div className="flex flex-wrap gap-2">
            {selectedMat ? (
              <button
                onClick={() => {
                  setShowStockIn(true)
                  stockInPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className="rounded-full border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
              >
                {language === 'hi' ? '+ à¤¸à¥à¤Ÿà¥‰à¤• à¤œà¥‹à¤¡à¤¼à¥‡à¤‚' : language === 'hinglish' ? `+ ${terms.inventory} add karo` : `+ Add ${terms.inventory.toLowerCase()}`}
              </button>
            ) : null}
            <button onClick={() => { setShowBillScan(s => !s); setShowAddNew(false); setBillImportMessage('') }}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
              {showBillScan
                ? (language === 'hi' ? 'à¤¸à¥à¤•à¥ˆà¤¨à¤° à¤¬à¤‚à¤¦ à¤•à¤°à¥‡à¤‚' : language === 'hinglish' ? 'Scanner band karo' : 'Close scanner')
                : (language === 'hi' ? 'à¤¬à¤¿à¤² à¤¸à¥à¤•à¥ˆà¤¨ à¤•à¤°à¥‡à¤‚' : language === 'hinglish' ? 'Bill scan karo' : 'Scan bill')}
            </button>
            <button onClick={openAddItemForm}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950">
              {language === 'hi' ? '+ à¤®à¤Ÿà¥‡à¤°à¤¿à¤¯à¤² à¤œà¥‹à¤¡à¤¼à¥‡à¤‚' : language === 'hinglish' ? `+ ${terms.material} add karo` : `+ Add ${terms.material.toLowerCase()}`}
            </button>
          </div>
        }
      />
      </div>

      <div ref={inventoryContentRef}>
        {billImportMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            {billImportMessage}
          </div>
        )}

      {showBillScan && (
        <div ref={billScanPanelRef}>
          <BillScanPanel
            materials={list}
            locations={activeLocations}
            defaultLocationId={defaultLocation?.id ?? undefined}
            units={unitOptions}
            preferredUnits={preferredUnits}
            materialLabel={terms.material}
            inventoryLabel={terms.inventory}
            onClose={() => setShowBillScan(false)}
            onImported={setBillImportMessage}
          />
        </div>
      )}

      <MetricGrid className="mb-6 hidden md:grid">
        <MetricCard label={t(`Active ${terms.material.toLowerCase()}s`, 'à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤®à¤Ÿà¥‡à¤°à¤¿à¤¯à¤²', `Active ${terms.material.toLowerCase()}s`)} value={initialLoading ? '—' : String(list.length)} hint={t('Live catalog count', 'à¤²à¤¾à¤‡à¤µ à¤•à¥ˆà¤Ÿà¤²à¥‰à¤— à¤¸à¤‚à¤–à¥à¤¯à¤¾')} />
        <MetricCard label={t('Low / out of stock', 'à¤²à¥‹ / à¤†à¤‰à¤Ÿ à¤‘à¤« à¤¸à¥à¤Ÿà¥‰à¤•')} value={initialLoading ? '—' : String(list.filter((m: any) => m.stockStatus !== 'OK').length)} hint={t('Items needing replenishment', 'à¤œà¤¿à¤¨ à¤†à¤‡à¤Ÿà¤® à¤•à¥‹ à¤°à¥€à¤ªà¥à¤²à¥‡à¤¨à¤¿à¤¶à¤®à¥‡à¤‚à¤Ÿ à¤šà¤¾à¤¹à¤¿à¤')} tone="danger" />
        <MetricCard label={t(`${terms.inventory} value`, 'à¤‡à¤¨à¥à¤µà¥‡à¤‚à¤Ÿà¥à¤°à¥€ à¤µà¥ˆà¤²à¥à¤¯à¥‚', `${terms.inventory} value`)} value={initialLoading ? '—' : fmt(list.reduce((sum: number, m: any) => sum + Number(m.stockQty) * Number(m.purchasePrice), 0))} hint={t('Estimated purchase-side stock value', 'à¤…à¤¨à¥à¤®à¤¾à¤¨à¤¿à¤¤ à¤–à¤°à¥€à¤¦-à¤†à¤§à¤¾à¤°à¤¿à¤¤ à¤¸à¥à¤Ÿà¥‰à¤• à¤®à¥‚à¤²à¥à¤¯')} tone="brand" />
        <MetricCard label={t(`Selected ${terms.material.toLowerCase()}`, 'à¤šà¤¯à¤¨à¤¿à¤¤ à¤®à¤Ÿà¥‡à¤°à¤¿à¤¯à¤²', `Selected ${terms.material.toLowerCase()}`)} value={selectedMat?.name ?? t('None', 'à¤•à¥‹à¤ˆ à¤¨à¤¹à¥€à¤‚')} hint={selectedMat ? `${Number(selectedMat.stockQty).toFixed(1)} ${selectedMat.unit} ${t('available', 'à¤‰à¤ªà¤²à¤¬à¥à¤§')}` : t('Open a card for movement details', 'à¤®à¥‚à¤µà¤®à¥‡à¤‚à¤Ÿ à¤µà¤¿à¤µà¤°à¤£ à¤•à¥‡ à¤²à¤¿à¤ à¤•à¤¾à¤°à¥à¤¡ à¤šà¥à¤¨à¥‡à¤‚')} tone="default" />
      </MetricGrid>
      <div className="mb-4 grid grid-cols-2 gap-3 md:hidden">
        <MetricCard label={t(`Active ${terms.material.toLowerCase()}s`, 'à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤®à¤Ÿà¥‡à¤°à¤¿à¤¯à¤²', `Active ${terms.material.toLowerCase()}s`)} value={initialLoading ? '—' : String(list.length)} hint={t('Live catalog count', 'à¤²à¤¾à¤‡à¤µ à¤•à¥ˆà¤Ÿà¤²à¥‰à¤— à¤¸à¤‚à¤–à¥à¤¯à¤¾')} />
        <MetricCard label={t('Low / out of stock', 'à¤²à¥‹ / à¤†à¤‰à¤Ÿ à¤‘à¤« à¤¸à¥à¤Ÿà¥‰à¤•')} value={initialLoading ? '—' : String(list.filter((m: any) => m.stockStatus !== 'OK').length)} hint={t('Items needing replenishment', 'à¤œà¤¿à¤¨ à¤†à¤‡à¤Ÿà¤® à¤•à¥‹ à¤°à¥€à¤ªà¥à¤²à¥‡à¤¨à¤¿à¤¶à¤®à¥‡à¤‚à¤Ÿ à¤šà¤¾à¤¹à¤¿à¤')} tone="danger" />
        <MetricCard label={t(`${terms.inventory} value`, 'à¤‡à¤¨à¥à¤µà¥‡à¤‚à¤Ÿà¥à¤°à¥€ à¤µà¥ˆà¤²à¥à¤¯à¥‚', `${terms.inventory} value`)} value={initialLoading ? '—' : fmt(list.reduce((sum: number, m: any) => sum + Number(m.stockQty) * Number(m.purchasePrice), 0))} hint={t('Estimated purchase-side stock value', 'à¤…à¤¨à¥à¤®à¤¾à¤¨à¤¿à¤¤ à¤–à¤°à¥€à¤¦-à¤†à¤§à¤¾à¤°à¤¿à¤¤ à¤¸à¥à¤Ÿà¥‰à¤• à¤®à¥‚à¤²à¥à¤¯')} tone="brand" />
        <MetricCard label={t(`Selected ${terms.material.toLowerCase()}`, 'à¤šà¤¯à¤¨à¤¿à¤¤ à¤®à¤Ÿà¥‡à¤°à¤¿à¤¯à¤²', `Selected ${terms.material.toLowerCase()}`)} value={selectedMat?.name ?? t('None', 'à¤•à¥‹à¤ˆ à¤¨à¤¹à¥€à¤‚')} hint={selectedMat ? `${Number(selectedMat.stockQty).toFixed(1)} ${selectedMat.unit} ${t('available', 'à¤‰à¤ªà¤²à¤¬à¥à¤§')}` : t('Open a card for movement details', 'à¤®à¥‚à¤µà¤®à¥‡à¤‚à¤Ÿ à¤µà¤¿à¤µà¤°à¤£ à¤•à¥‡ à¤²à¤¿à¤ à¤•à¤¾à¤°à¥à¤¡ à¤šà¥à¤¨à¥‡à¤‚')} tone="default" />
      </div>

      {/* Add new material form */}
      {showAddNew && (
        <div ref={addNewFormRef}>
        <Card className="mb-4">
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">{t(`New ${terms.material.toLowerCase()}`, 'à¤¨à¤¯à¤¾ à¤®à¤Ÿà¥‡à¤°à¤¿à¤¯à¤²', `New ${terms.material.toLowerCase()}`)}</div>
          <form onSubmit={handleCreateMaterial} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">{t('Name *', 'à¤¨à¤¾à¤® *')}</label>
                <input ref={addNewNameInputRef} type="text" value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                  placeholder={language === 'hi' ? 'à¤œà¥ˆà¤¸à¥‡: à¤‰à¤¦à¤¾à¤¹à¤°à¤£ à¤†à¤‡à¤Ÿà¤®' : language === 'hinglish' ? `e.g. Sample ${terms.material}` : `e.g. Sample ${terms.material}`} required
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Unit *', 'à¤¯à¥‚à¤¨à¤¿à¤Ÿ *')}</label>
                <select value={newForm.unit} onChange={e => setNewForm(p => ({ ...p, unit: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {preferredUnits.map((u) => <option key={`pref-${u}`} value={u}>{u}</option>)}
                  {preferredUnits.length > 0 && otherUnits.length > 0 ? <option disabled>--------</option> : null}
                  {otherUnits.map((u) => <option key={`other-${u}`} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Initial stock', 'à¤ªà¥à¤°à¤¾à¤°à¤‚à¤­à¤¿à¤• à¤¸à¥à¤Ÿà¥‰à¤•')}</label>
                <input type="number" value={newForm.stockQty} placeholder="0" onChange={e => setNewForm(p => ({ ...p, stockQty: e.target.value }))}
                  min={0} step={0.01}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Min threshold', 'à¤¨à¥à¤¯à¥‚à¤¨à¤¤à¤® à¤¸à¥€à¤®à¤¾')}</label>
                <input type="number" value={newForm.minThreshold} placeholder="0" onChange={e => setNewForm(p => ({ ...p, minThreshold: e.target.value }))}
                  min={0} step={0.01}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Max threshold', 'à¤…à¤§à¤¿à¤•à¤¤à¤® à¤¸à¥€à¤®à¤¾')}</label>
                <input type="number" value={newForm.maxThreshold} placeholder="0" onChange={e => setNewForm(p => ({ ...p, maxThreshold: e.target.value }))}
                  min={0} step={0.01}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Purchase price (â‚¹) *', 'à¤–à¤°à¥€à¤¦ à¤®à¥‚à¤²à¥à¤¯ (â‚¹) *')}</label>
                <input type="number" value={newForm.purchasePrice} placeholder="0" onChange={e => setNewForm(p => ({ ...p, purchasePrice: e.target.value }))}
                  min={0} step={0.01} required
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Sale price (â‚¹) *', 'à¤¬à¤¿à¤•à¥à¤°à¥€ à¤®à¥‚à¤²à¥à¤¯ (â‚¹) *')}</label>
                <input type="number" value={newForm.salePrice} placeholder="0" onChange={e => setNewForm(p => ({ ...p, salePrice: e.target.value }))}
                  min={0} step={0.01} required
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">{t('Category', 'à¤¶à¥à¤°à¥‡à¤£à¥€')}</label>
                <input type="text" value={newForm.category} onChange={e => setNewForm(p => ({ ...p, category: e.target.value }))}
                  placeholder={language === 'hi' ? 'à¤œà¥ˆà¤¸à¥‡: medicine' : 'e.g. medicine'}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {canBatch ? (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Batch number</label>
                  <input type="text" value={newForm.batchNumber} onChange={e => setNewForm(p => ({ ...p, batchNumber: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : null}
              {canExpiry ? (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Expiry date</label>
                  <input type="date" value={newForm.expiryDate} onChange={e => setNewForm(p => ({ ...p, expiryDate: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : null}
              {canSerial ? (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Serial / IMEI</label>
                  <input type="text" value={newForm.serialNumber} onChange={e => setNewForm(p => ({ ...p, serialNumber: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : null}
              {canVariants ? (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Size / Color</label>
                  <input type="text" value={`${newForm.size}${newForm.color ? ` / ${newForm.color}` : ''}`}
                    onChange={e => {
                      const parts = e.target.value.split('/').map((x) => x.trim())
                      setNewForm(p => ({ ...p, size: parts[0] ?? '', color: parts[1] ?? '' }))
                    }}
                    className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : null}
              {canWeight ? (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Net weight</label>
                  <input type="number" min={0} step={0.01} value={newForm.netWeight} onChange={e => setNewForm(p => ({ ...p, netWeight: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : null}
            </div>
            {renderScopedFields(newForm, setNewForm)}
            <div className="flex gap-2">
              <button type="submit" disabled={createMaterial.isPending}
                className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createMaterial.isPending ? (language === 'hi' ? 'à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...' : language === 'hinglish' ? 'Save ho raha hai...' : 'Saving...') : (language === 'hi' ? 'à¤¸à¥‡à¤µ à¤•à¤°à¥‡à¤‚' : language === 'hinglish' ? `${terms.material} save karo` : `Save ${terms.material.toLowerCase()}`)}
              </button>
              <button type="button" onClick={() => setShowAddNew(false)}
                className="text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800">{language === 'hi' ? 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚' : 'Cancel'}</button>
            </div>
            {newError && <div className="text-xs text-red-600">{newError}</div>}
          </form>
        </Card>
        </div>
      )}

      {showEdit && selectedMat && (
        <div ref={addNewFormRef}>
        <Card className="mb-4">
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Edit {terms.material.toLowerCase()}</div>
          <form onSubmit={handleUpdateMaterial} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Name *</label>
                <input type="text" required value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Category</label>
                <input type="text" value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Unit *</label>
                <select value={editForm.unit} onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {preferredUnits.map((u) => <option key={`epref-${u}`} value={u}>{u}</option>)}
                  {preferredUnits.length > 0 && otherUnits.length > 0 ? <option disabled>--------</option> : null}
                  {otherUnits.map((u) => <option key={`eother-${u}`} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Stock quantity</label>
                <input type="number" value={editForm.stockQty} min={0} step={0.01} onChange={e => setEditForm(p => ({ ...p, stockQty: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Min threshold</label>
                <input type="number" value={editForm.minThreshold} min={0} step={0.01} onChange={e => setEditForm(p => ({ ...p, minThreshold: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Max threshold</label>
                <input type="number" value={editForm.maxThreshold} min={0} step={0.01} onChange={e => setEditForm(p => ({ ...p, maxThreshold: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Purchase price</label>
                <input type="number" value={editForm.purchasePrice} min={0} step={0.01} onChange={e => setEditForm(p => ({ ...p, purchasePrice: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Sale price</label>
                <input type="number" value={editForm.salePrice} min={0} step={0.01} onChange={e => setEditForm(p => ({ ...p, salePrice: e.target.value }))}
                  className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {canExpiry ? (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Expiry date</label>
                  <input type="date" value={editForm.expiryDate} onChange={e => setEditForm(p => ({ ...p, expiryDate: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : null}
              {canBatch ? (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Batch number</label>
                  <input type="text" value={editForm.batchNumber} onChange={e => setEditForm(p => ({ ...p, batchNumber: e.target.value }))}
                    className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : null}
            </div>
            {renderScopedFields(editForm, setEditForm)}
            <div className="flex gap-2">
              <button type="submit" disabled={updateMaterial.isPending}
                className="text-xs px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {updateMaterial.isPending ? 'Updating...' : 'Update'}
              </button>
              <button type="button" onClick={() => setShowEdit(false)}
                className="text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800">Cancel</button>
            </div>
            {editError && <div className="text-xs text-red-600">{editError}</div>}
          </form>
        </Card>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-800 dark:bg-red-950">
          <span className="text-xs font-medium text-red-800 dark:text-red-200">
            {selected.size} {terms.material.toLowerCase()}{selected.size > 1 ? 's' : ''} selected
          </span>
          <button onClick={handleBulkDelete} disabled={bulkDelete.isPending}
            className="text-xs px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 font-medium transition-colors">
            {bulkDelete.isPending ? (language === 'hi' ? 'à¤¹à¤Ÿà¤¾à¤¯à¤¾ à¤œà¤¾ à¤°à¤¹à¤¾ à¤¹à¥ˆ...' : language === 'hinglish' ? 'Delete ho raha hai...' : 'Deleting...') : (language === 'hi' ? 'à¤šà¤¯à¤¨à¤¿à¤¤ à¤¹à¤Ÿà¤¾à¤à¤‚' : language === 'hinglish' ? 'Selected delete karo' : 'Delete selected')}
          </button>
          <button
            type="button"
            onClick={startBulkTransferFromSelection}
            className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition-colors"
          >
            {t('Transfer selected', 'चयनित ट्रांसफर करें', 'Selected transfer karo')}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="ml-0 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 md:ml-auto">
            {language === 'hi' ? 'à¤šà¤¯à¤¨ à¤¹à¤Ÿà¤¾à¤à¤‚' : language === 'hinglish' ? 'Selection clear karo' : 'Clear selection'}
          </button>
        </div>
      )}

      {/* Select all toggle */}
      {list.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 md:border-none md:bg-transparent md:px-0 md:py-0 dark:border-slate-700 dark:bg-slate-900/50">
          <label className="inline-flex items-center gap-2 text-xs text-stone-600 dark:text-slate-300">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span>{t('Select all', 'à¤¸à¤­à¥€ à¤šà¥à¤¨à¥‡à¤‚')}</span>
          </label>
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {t('Clear', 'à¤¹à¤Ÿà¤¾à¤à¤‚', 'Clear')}
            </button>
          ) : null}
        </div>
      )}

      {/* Material cards grid */}
      <div data-inventory-toolbar="true" className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? <div className="md:col-span-2 xl:col-span-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Material</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">—</div>
                <div className="text-xs text-slate-500">Loading...</div>
              </div>
            ))}
          </div>
        </div> :
          list.map((m: any) => {
            const isSelected = selected.has(m.id)
            return (
              <div data-material-card="true" key={m.id} className={`relative rounded-xl border transition-all ${
                selectedId === m.id
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950'
                  : isSelected
                    ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-stone-300 dark:hover:border-slate-500'
              } ${m.stockStatus === 'LOW' && selectedId !== m.id ? 'border-amber-300' : ''} ${m.stockStatus === 'OUT_OF_STOCK' && selectedId !== m.id ? 'border-red-400' : ''}`}>
                {/* Checkbox overlay */}
                <div className="absolute top-3 left-3 z-10">
                  <input type="checkbox" checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); toggleOne(m.id) }}
                    className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                </div>
                <button onClick={() => setSelectedId(m.id === selectedId ? '' : m.id)}
                  className="w-full text-left p-4 pl-9">
                  <div className="mb-2 flex items-start justify-between pr-12">
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200">{m.name}</div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={statusBadge(m.stockStatus)}>{m.stockStatus}</Badge>
                    </div>
                  </div>
                  <div className="text-xl font-medium text-stone-900 dark:text-stone-100">
                    {Number(m.stockQty).toFixed(m.unit === 'bags' ? 0 : 1)} <span className="text-sm font-normal text-stone-500 dark:text-slate-300">{m.unit}</span>
                  </div>
                  {/* Stock bar */}
                  <div className="mt-2 h-1 bg-stone-100 dark:bg-stone-800 rounded">
                    <div className="h-1 rounded transition-all"
                      style={{
                        width: `${Math.min(100, (Number(m.stockQty) / (Number(m.maxThreshold) || Number(m.stockQty) + 1)) * 100)}%`,
                        background: m.stockStatus === 'OK' ? '#639922' : m.stockStatus === 'LOW' ? '#EF9F27' : '#E24B4A',
                      }} />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-stone-400 dark:text-slate-400">
                    <span>Min: {Number(m.minThreshold)} {m.unit}</span>
                    <span>Buy: {fmt(Number(m.purchasePrice))} • Sell: {fmt(Number(m.salePrice))}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-stone-500 dark:text-slate-300">
                    {canBatch && m.batchNumber ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Batch: {m.batchNumber}</span> : null}
                    {canExpiry && m.expiryDate ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Expiry: {String(m.expiryDate).slice(0, 10)}</span> : null}
                    {canStorage && m.manufacturer ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Mfr: {m.manufacturer}</span> : null}
                    {canStorage && m.rackLocation ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Rack: {m.rackLocation}</span> : null}
                    {canBarcode && m.barcode ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Barcode: {m.barcode}</span> : null}
                    {canVariants && m.size ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Size: {m.size}</span> : null}
                    {canVariants && m.color ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Color: {m.color}</span> : null}
                    {canVariants && m.material ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Material: {m.material}</span> : null}
                    {canSerial && m.serialNumber ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Serial: {m.serialNumber}</span> : null}
                    {canSerial && m.imeiNumber ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">IMEI: {m.imeiNumber}</span> : null}
                    {canWeight && m.grossWeight != null ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Gross: {m.grossWeight}</span> : null}
                    {canWeight && m.tareWeight != null ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Tare: {m.tareWeight}</span> : null}
                    {canWeight && m.netWeight != null ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Net: {m.netWeight}</span> : null}
                    {canJewellery && m.purity != null ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Purity: {m.purity}%</span> : null}
                    {canJewellery && m.makingCharges != null ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-slate-800">Making: {fmt(Number(m.makingCharges))}</span> : null}
                  </div>
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedId(m.id); setShowEdit(true); setShowAddNew(false) }}
                  className="absolute top-2 right-9 inline-flex h-5 w-5 items-center justify-center rounded text-stone-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                  title="Edit"
                  aria-label="Edit item"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(m.id, m.name) }}
                  className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                  title={`Delete ${terms.material.toLowerCase()}`}
                  aria-label={`Delete ${terms.material.toLowerCase()}`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            )
          })
        }
      </div>

      {selectedId && (
        <div data-stock-panel="true" ref={stockInPanelRef} className="grid gap-4 xl:grid-cols-2">
          {/* Stock in form */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                {terms.inventory} in - {selectedMat?.name}
              </div>
              <button onClick={() => setShowStockIn(s => !s)}
                className="text-xs text-blue-600 hover:underline">
                {showStockIn ? (language === 'hi' ? 'à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚' : 'Cancel') : (language === 'hi' ? '+ à¤¸à¥à¤Ÿà¥‰à¤• à¤œà¥‹à¤¡à¤¼à¥‡à¤‚' : language === 'hinglish' ? `+ ${terms.inventory} add karo` : `+ Add ${terms.inventory.toLowerCase()}`)}
              </button>
            </div>
            {showStockIn && (
              <form onSubmit={handleStockIn} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Quantity ({selectedMat?.unit}) *</label>
                    <input type="number" value={siQty} onChange={e => setSiQty(e.target.value)}
                      placeholder="0" min={0.01} step={0.01} required
                      className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">{t('Purchase price', 'à¤–à¤°à¥€à¤¦ à¤®à¥‚à¤²à¥à¤¯')} (â‚¹/{selectedMat?.unit}) *</label>
                    <input type="number" value={siPrice} onChange={e => setSiPrice(e.target.value)}
                      placeholder={String(selectedMat?.purchasePrice ?? 0)} min={0} required
                      className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Note / supplier</label>
                  <input type="text" value={siNote} onChange={e => setSiNote(e.target.value)}
                    placeholder={language === 'hi' ? 'à¤œà¥ˆà¤¸à¥‡: à¤¸à¤ªà¥à¤²à¤¾à¤¯à¤° à¤¸à¥‡ à¤–à¤°à¥€à¤¦' : language === 'hinglish' ? 'e.g. Supplier purchase' : 'e.g. Supplier purchase'}
                    className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {siError ? (
                  <div className="space-y-2">
                    <div className="text-xs text-red-600">{siError}</div>
                    {siError.toLowerCase().includes('default location') ? (
                      <Link
                        href="/settings/locations"
                        className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
                      >
                        Open Locations
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                <button type="submit" disabled={stockIn.isPending}
                  className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {stockIn.isPending ? (language === 'hi' ? 'à¤¸à¥‡à¤µ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...' : language === 'hinglish' ? 'Save ho raha hai...' : 'Saving...') : (language === 'hi' ? 'à¤¸à¥à¤Ÿà¥‰à¤• à¤®à¥‡à¤‚ à¤œà¥‹à¤¡à¤¼à¥‡à¤‚' : language === 'hinglish' ? `${terms.inventory} me add karo` : `Add to ${terms.inventory.toLowerCase()}`)}
                </button>
              </form>
            )}
            {!showStockIn && (
              <div className="text-xs text-stone-400 py-4 text-center">
                {`Click "+ Add ${terms.inventory.toLowerCase()}" to record a purchase from supplier`}
              </div>
            )}
          </Card>

          {/* Movement log */}
          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">{t('Recent movements', 'à¤¹à¤¾à¤² à¤•à¥€ à¤—à¤¤à¤¿à¤µà¤¿à¤§à¤¿à¤¯à¤¾à¤‚')}</div>
            {!movements ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="text-xs text-slate-500">Loading...</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">—</div>
                  </div>
                ))}
              </div>
            ) : movements.length === 0 ? (
              <div className="text-xs text-stone-400 py-4 text-center">{t('No movements yet', 'à¤…à¤­à¥€ à¤•à¥‹à¤ˆ à¤®à¥‚à¤µà¤®à¥‡à¤‚à¤Ÿ à¤¨à¤¹à¥€à¤‚')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead>
                  <tr className="border-b border-stone-100 dark:border-stone-800">
                    {[t('Date', 'à¤¤à¤¾à¤°à¥€à¤–'), t('Type', 'à¤ªà¥à¤°à¤•à¤¾à¤°'), t('Qty', 'à¤®à¤¾à¤¤à¥à¤°à¤¾'), t('Stock after', 'à¤¸à¥à¤Ÿà¥‰à¤• à¤¬à¤¾à¤¦ à¤®à¥‡à¤‚'), t('Reason', 'à¤•à¤¾à¤°à¤£')].map(h => (
                      <th key={h} className="text-left py-2 pr-2 font-normal text-stone-400 dark:text-slate-300">{h}</th>
                    ))}
                  </tr>
                  </thead>
                  <tbody>
                  {movements.slice(0,10).map((mv: any) => (
                    <tr key={mv.id} className="border-b border-stone-50 dark:border-stone-800 last:border-0">
                      <td className="py-2 pr-2 text-stone-500 dark:text-slate-300">{new Date(mv.createdAt).toLocaleDateString('en-IN')}</td>
                      <td className="py-2 pr-2">
                        <Badge variant={mv.type === 'IN' ? 'success' : mv.type === 'OUT' ? 'danger' : 'default'}>
                          {mv.type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-2 font-medium">{Number(mv.quantity).toFixed(1)}</td>
                      <td className="py-2 pr-2 text-stone-600 dark:text-slate-300">{Number(mv.stockAfter).toFixed(1)}</td>
                      <td className="py-2 text-stone-500 dark:text-slate-300 truncate max-w-24">{mv.reason ?? mv.order?.orderNumber ?? 'â€”'}</td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Stock by location</div>
            <div className="flex items-center gap-2">
              <select
                value={stockLocationFilterId}
                onChange={(e) => setStockLocationFilterId(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">All locations</option>
                {activeLocations.map((loc: any) => (
                  <option key={`stock-filter-${loc.id}`} value={loc.id}>
                    {loc.name}{loc.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBackfillLocationStock}
                disabled={backfillLocationStock.isPending}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {backfillLocationStock.isPending ? 'Mapping...' : 'Backfill old stock'}
              </button>
            </div>
          </div>
          {backfillMessage ? (
            <div className={`mb-2 text-[11px] ${backfillMessage.toLowerCase().includes('failed') || backfillMessage.toLowerCase().includes('not configured') ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-300'}`}>
              {backfillMessage}
            </div>
          ) : null}
          <div className="space-y-2 md:hidden">
            {(stockByLocation ?? []).slice(0, 50).map((row: any) => (
              <div key={`m-${row.materialId}:${row.locationId}`} className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 truncate">{row.materialName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{row.locationName}</div>
                  </div>
                  <div className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {Number(row.quantity).toFixed(2)} {row.unit}
                  </div>
                </div>
              </div>
            ))}
            {(stockByLocation ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t('No location stock available yet.', 'à¤…à¤­à¥€ à¤²à¥‹à¤•à¥‡à¤¶à¤¨ à¤¸à¥à¤Ÿà¥‰à¤• à¤‰à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤', 'Location stock abhi available nahi hai.')}
              </div>
            ) : null}
          </div>
          <div className="hidden max-h-64 overflow-auto rounded-lg border border-stone-200 md:block dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 dark:bg-slate-900">
                <tr>
                  <th className="px-2 py-2 text-left">Material</th>
                  <th className="px-2 py-2 text-left">Location</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {(stockByLocation ?? []).slice(0, 150).map((row: any) => (
                  <tr key={`${row.materialId}:${row.locationId}`} className="border-t border-stone-100 dark:border-slate-800">
                    <td className="px-2 py-1.5">{row.materialName}</td>
                    <td className="px-2 py-1.5">{row.locationName}</td>
                    <td className="px-2 py-1.5 text-right">{Number(row.quantity).toFixed(2)} {row.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div ref={transferPanelRef} />
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">Stock transfer</div>
          <form onSubmit={handleCreateTransfer} className="grid grid-cols-1 gap-2">
            <select
              value={transferFromLocationId}
              onChange={(e) => setTransferFromLocationId(e.target.value)}
              className={inputClass}
            >
              <option value="">From location</option>
              {activeLocations.map((loc: any) => (
                <option key={`from-${loc.id}`} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <select
              value={transferToLocationId}
              onChange={(e) => setTransferToLocationId(e.target.value)}
              className={inputClass}
            >
              <option value="">To location</option>
              {activeLocations.filter((loc: any) => loc.id !== transferFromLocationId).map((loc: any) => (
                <option key={`to-${loc.id}`} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            {bulkTransferMode ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/60">
                {selectedMaterials.map((material: any) => {
                  const available = Number((sourceStockByLocation ?? []).find(
                    (entry: any) => entry.locationId === transferFromLocationId && entry.materialId === material.id
                  )?.quantity ?? 0)
                  return (
                    <div key={material.id} className="grid grid-cols-[1fr_120px] items-center gap-2">
                      <div className="truncate text-xs text-stone-700 dark:text-slate-200">{material.name}</div>
                      <input
                        type="number"
                        min={0}
                        step={0.001}
                        max={available > 0 ? available : undefined}
                        placeholder={`Qty (max ${available.toFixed(3)})`}
                        value={bulkTransferQty[material.id] ?? ''}
                        onChange={(e) => setBulkTransferQty((prev) => ({ ...prev, [material.id]: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  )
                })}
                <button
                  type="button"
                  className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  onClick={() => {
                    setBulkTransferMode(false)
                    setBulkTransferQty({})
                  }}
                >
                  Use single material transfer
                </button>
              </div>
            ) : (
              <>
                <select
                  value={transferMaterialId}
                  onChange={(e) => setTransferMaterialId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Material</option>
                  {list.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0.001}
                  step={0.001}
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  max={availableTransferQty > 0 ? availableTransferQty : undefined}
                  placeholder="Quantity"
                  className={inputClass}
                />
                <div className="text-[11px] text-stone-500 dark:text-slate-400">
                  Available at source: {availableTransferQty.toFixed(3)}
                </div>
              </>
            )}
            {transferError ? <div className="text-xs text-red-600">{transferError}</div> : null}
            <div className="pt-1">
              <button
                type="submit"
                disabled={createTransfer.isPending}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950"
              >
                {createTransfer.isPending ? 'Transferring...' : 'Transfer stock'}
              </button>
            </div>
          </form>
        </Card>
      </div>
      </div>

      {selectedMat ? (
        <button
          type="button"
          onClick={() => {
            setShowStockIn(true)
            stockInPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="fixed bottom-20 right-4 z-40 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-blue-700 md:bottom-6 md:right-6"
        >
          {language === 'hi' ? '+ à¤¸à¥à¤Ÿà¥‰à¤• à¤œà¥‹à¤¡à¤¼à¥‡à¤‚' : language === 'hinglish' ? `+ ${terms.inventory} add karo` : `+ Add ${terms.inventory.toLowerCase()}`}
        </button>
      ) : null}
      </>
      ) : null}
    </AppShell>
  )
}






