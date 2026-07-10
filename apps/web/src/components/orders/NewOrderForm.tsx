'use client'

import { Card } from '@/components/ui/Card'
import { useCustomers } from '@/hooks/useCustomers'
import { useInventoryOptions, useLocations, useStockByLocation } from '@/hooks/useInventory'
import { useCreateOrder } from '@/hooks/useOrders'
import { getStateCodeFromGstin, useBusinessConfig } from '@/hooks/useBusinessConfig'
import { fmt } from '@/lib/utils'
import { computeOrderPreview } from '@cement-house/utils'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities'
import { useReferralPartners } from '@/hooks/useReferralPartners'

type BillingBasis = 'QUANTITY' | 'WEIGHT'

type Product = {
  id: string
  variantId?: string
  variantName?: string
  name: string
  price: number
  unit: string
  hsnCode: string
  gstRate: number
  isExempted: boolean
  purchasePrice: number
  salePrice: number
  stockQty: number
  billingBasis: BillingBasis
  barcode: string
  batchNumber: string
  expiryDate: string
}

type LineItem = {
  materialId: string
  variantId?: string
  materialName: string
  unit: string
  quantity: number
  unitPrice: number
  purchasePrice: number
  discountAmount: number
  gstRate: number
  hsnCode: string
  isExempted: boolean
  billingBasis: BillingBasis
  batchNumber?: string
  expiryDate?: string
  barcode?: string
  serialOrImei?: string
  grossWeight?: number
  tareWeight?: number
  netWeight?: number
}

const PAYMENT_MODES = ['CASH', 'UPI', 'CHEQUE', 'CREDIT', 'PARTIAL']

// The quantity a line is actually billed on: net weight for weight-sold products
// (when a positive weight is entered), otherwise the entered quantity. Mirrors the
// server's billing engine so the on-screen total matches what gets saved.
function billedQuantity(item: Pick<LineItem, 'billingBasis' | 'quantity' | 'grossWeight' | 'tareWeight' | 'netWeight'>) {
  if (item.billingBasis === 'WEIGHT') {
    const gross = Number(item.grossWeight ?? 0)
    const tare = Number(item.tareWeight ?? 0)
    const net = Number(item.netWeight ?? 0) || Math.max(0, gross - tare)
    if (net > 0) return net
  }
  return Number(item.quantity)
}

function todayDateInput() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface NewOrderFormProps {
  redirectOnSuccess?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}

export function NewOrderForm({ redirectOnSuccess = true, onSuccess, onCancel }: NewOrderFormProps) {
  const { language } = useI18n()
  const { hasFeature } = useTenantCapabilities()
  const { gstBilling, storeStateCode } = useBusinessConfig()
  const router = useRouter()
  const [shouldLoadCustomers, setShouldLoadCustomers] = useState(false)
  const [shouldLoadMaterials, setShouldLoadMaterials] = useState(false)
  const [shouldLoadLocations, setShouldLoadLocations] = useState(false)
  const [shouldLoadPartners, setShouldLoadPartners] = useState(false)
  const { data: customers, isLoading: customersLoading } = useCustomers(undefined, { enabled: shouldLoadCustomers })
  const { data: materials, isLoading: materialsLoading } = useInventoryOptions({ enabled: shouldLoadMaterials })
  const { data: locations } = useLocations({ enabled: shouldLoadLocations })
  const { data: referralPartners, isLoading: partnersLoading } = useReferralPartners(undefined, { enabled: shouldLoadPartners })
  const createOrder = useCreateOrder()

  const [customerId, setCustomerId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [sourceLocationId, setSourceLocationId] = useState('')
  const [referralPartnerId, setReferralPartnerId] = useState('')
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [amountPaid, setAmountPaid] = useState(0)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([
    {
      materialId: '',
      materialName: '',
      unit: '',
      quantity: 1,
      unitPrice: 0,
      purchasePrice: 0,
      discountAmount: 0,
      gstRate: 0,
      hsnCode: '',
      isExempted: false,
      billingBasis: 'QUANTITY',
      batchNumber: '',
      expiryDate: '',
      barcode: '',
      serialOrImei: '',
      grossWeight: 0,
      tareWeight: 0,
      netWeight: 0,
    },
  ])
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [scanValue, setScanValue] = useState('')
  const [scanFeedback, setScanFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const selectedCustomer = (customers ?? []).find((c: any) => c.id === customerId)
  const customerStateCode = (selectedCustomer?.stateCode as string | undefined | null) || getStateCodeFromGstin(selectedCustomer?.gstin ?? null)
  const isInterState = Boolean(selectedCustomer) && Boolean(storeStateCode) && Boolean(customerStateCode) && storeStateCode !== customerStateCode
  const minDeliveryDate = todayDateInput()
  const activeLocations = (locations ?? []).filter((l: any) => l.isActive)
  const defaultLocation = activeLocations.find((loc: any) => loc.isDefault) ?? null
  const effectiveSourceLocationId = sourceLocationId || defaultLocation?.id || undefined
  const { data: sourceStockRows } = useStockByLocation(effectiveSourceLocationId)
  const showBatch = hasFeature('batchTracking')
  const showExpiry = hasFeature('expiryTracking')
  const showBarcode = hasFeature('barcodeSupport')
  const showSerial = hasFeature('serialTracking')
  const showWeight = hasFeature('weightBasedBilling')
  const showGst = hasFeature('gstBilling')
  const anyWeightBasis = items.some((i) => i.billingBasis === 'WEIGHT')
  const showAdvancedLineFields = showBatch || showExpiry || showBarcode || showSerial || showWeight || anyWeightBasis
  const sourceStockByMaterial = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of sourceStockRows ?? []) {
      map.set(String(row.materialId), Number(row.quantity ?? 0))
    }
    return map
  }, [sourceStockRows])

  const products: Product[] = (materials ?? []).map((m: any) => ({
    id: String(m.id),
    variantId: m.variantId ? String(m.variantId) : undefined,
    variantName: m.variantName ? String(m.variantName) : undefined,
    name: String(m.name ?? ''),
    price: Number(m.salePrice ?? 0),
    unit: String(m.unit ?? ''),
    hsnCode: String(m.hsnCode ?? ''),
    gstRate: Number(m.gstRate ?? 0),
    isExempted: Boolean(m.isExempted === true || Number(m.gstRate ?? 0) === 0),
    purchasePrice: Number(m.purchasePrice ?? 0),
    salePrice: Number(m.salePrice ?? 0),
    stockQty: Number(sourceStockByMaterial.get(String(m.id)) ?? 0),
    billingBasis: String(m.billingBasis).toUpperCase() === 'WEIGHT' ? 'WEIGHT' : 'QUANTITY',
    barcode: String(m.barcode ?? ''),
    batchNumber: String(m.batchNumber ?? ''),
    expiryDate: m.expiryDate ? String(m.expiryDate).slice(0, 10) : '',
  }))
  const inStockProducts = useMemo(
    () => products.filter((product) => Number(product.stockQty) > 0),
    [products]
  )
  const preview = useMemo(
    () =>
      computeOrderPreview(
        items.map((item) => ({
          quantity: billedQuantity(item),
          unitPrice: Number(item.unitPrice),
          discountAmount: Number(item.discountAmount ?? 0),
          gstRate: Number(item.gstRate ?? 0),
          hsnCode: item.hsnCode ?? '',
          isExempted: item.isExempted === true,
        })),
        isInterState,
        gstBilling
      ),
    [items, isInterState, gstBilling]
  )
  const totalAmount = preview.grandTotal
  const totalDue = Math.max(0, totalAmount - amountPaid)

  useEffect(() => {
    const locationTimer = window.setTimeout(() => setShouldLoadLocations(true), 120)
    const customerTimer = window.setTimeout(() => setShouldLoadCustomers(true), 220)
    const partnerTimer = window.setTimeout(() => setShouldLoadPartners(true), 260)
    return () => {
      window.clearTimeout(locationTimer)
      window.clearTimeout(customerTimer)
      window.clearTimeout(partnerTimer)
    }
  }, [])

  function locationLabel(loc: any) {
    const name = String(loc?.name ?? '')
    const lower = name.toLowerCase()
    const hasDefaultInName = lower.includes('(default)') || lower.startsWith('default ')
    if (loc?.isDefault && !hasDefaultInName) return `${name} (Default)`
    return name
  }

  function updateItem(idx: number, field: keyof LineItem, value: any) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        if (field === 'materialId') {
          const product = products.find((m) => m.id === value)
          return product
            ? {
                ...item,
                materialId: product.id,
                variantId: product.variantId,
                materialName: product.name,
                unit: product.unit,
                unitPrice: Number(product.salePrice),
                purchasePrice: Number(product.purchasePrice),
                hsnCode: product.hsnCode,
                gstRate: product.isExempted ? 0 : Number(product.gstRate),
                isExempted: product.isExempted,
                billingBasis: product.billingBasis,
              }
            : { ...item, materialId: value, variantId: undefined, billingBasis: 'QUANTITY' }
        }
        return {
          ...item,
          [field]:
            field === 'quantity' ||
            field === 'unitPrice' ||
            field === 'discountAmount' ||
            field === 'gstRate' ||
            field === 'grossWeight' ||
            field === 'tareWeight' ||
            field === 'netWeight'
              ? Number(value)
              : value,
        }
      })
    )
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        materialId: '',
        materialName: '',
        unit: '',
        quantity: 1,
        unitPrice: 0,
        purchasePrice: 0,
        discountAmount: 0,
        gstRate: 0,
        hsnCode: '',
        isExempted: false,
        billingBasis: 'QUANTITY',
        batchNumber: '',
        expiryDate: '',
        barcode: '',
        serialOrImei: '',
        grossWeight: 0,
        tareWeight: 0,
        netWeight: 0,
      },
    ])
  }

  // Barcode-first billing: a scan (or typed code + Enter) adds the matching
  // product as a line, or bumps quantity if it is already on the invoice —
  // the counter-scanning flow barcode retailers expect. Matching happens
  // against the already-loaded product list, so repeat scans cost no network.
  function handleBarcodeScan() {
    const code = scanValue.trim()
    setScanValue('')
    if (!code) return
    if (materialsLoading || !materials) {
      setScanFeedback({ tone: 'err', text: language === 'hi' ? 'आइटम लोड हो रहे हैं, फिर से स्कैन करें' : 'Items are still loading — scan again in a moment' })
      return
    }
    const product = products.find((p) => p.barcode && p.barcode === code)
    if (!product) {
      setScanFeedback({ tone: 'err', text: language === 'hi' ? `बारकोड ${code} वाला कोई आइटम नहीं मिला` : `No item found with barcode ${code}` })
      return
    }
    setItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.materialId === product.id)
      if (existingIdx >= 0) {
        setScanFeedback({ tone: 'ok', text: `✓ ${product.name} × ${Number(prev[existingIdx].quantity) + 1}` })
        return prev.map((item, i) => (i === existingIdx ? { ...item, quantity: Number(item.quantity) + 1 } : item))
      }
      const newLine: LineItem = {
        materialId: product.id,
        variantId: product.variantId,
        materialName: product.name,
        unit: product.unit,
        quantity: 1,
        unitPrice: Number(product.salePrice),
        purchasePrice: Number(product.purchasePrice),
        discountAmount: 0,
        gstRate: product.isExempted ? 0 : Number(product.gstRate),
        hsnCode: product.hsnCode,
        isExempted: product.isExempted,
        billingBasis: product.billingBasis,
        batchNumber: product.batchNumber,
        expiryDate: product.expiryDate,
        barcode: product.barcode,
        serialOrImei: '',
        grossWeight: 0,
        tareWeight: 0,
        netWeight: 0,
      }
      setScanFeedback({ tone: 'ok', text: `✓ ${product.name} × 1` })
      const emptyIdx = prev.findIndex((item) => !item.materialId)
      if (emptyIdx >= 0) return prev.map((item, i) => (i === emptyIdx ? newLine : item))
      return [...prev, newLine]
    })
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!customerId) return setError(language === 'hi' ? '?????? ?????' : 'Select a customer')
    if (items.some((i) => !i.materialId)) return setError(language === 'hi' ? '?? ???? ?? ??? ??????? ?????' : 'Select a material for each item')
    if (items.some((i) => i.quantity <= 0)) return setError(language === 'hi' ? '?????? 0 ?? ???? ???? ?????' : 'Quantity must be greater than 0')
    const effectiveNet = (i: LineItem) => Number(i.netWeight ?? 0) || Math.max(0, Number(i.grossWeight ?? 0) - Number(i.tareWeight ?? 0))
    const missingWeightIdx = items.findIndex((i) => i.billingBasis === 'WEIGHT' && !(effectiveNet(i) > 0))
    if (missingWeightIdx >= 0) {
      const name = items[missingWeightIdx].materialName || `item ${missingWeightIdx + 1}`
      return setError(`Enter a net weight for ${name} — it is sold by weight`)
    }
    if (deliveryDate && deliveryDate < minDeliveryDate) return setError(language === 'hi' ? '??????? ???? ????? ???? ?? ???? ???? ?? ????' : 'Delivery date cannot be earlier than order creation date')
    try {
      await createOrder.mutateAsync({
        customerId,
        referralPartnerId: referralPartnerId || undefined,
        sourceLocationId: sourceLocationId || undefined,
        deliveryDate: deliveryDate || undefined,
        gstEnabled: gstBilling,
        isInterState,
        customerGstin: selectedCustomer?.gstin ?? null,
        paymentMode,
        amountPaid,
        expectedTotal: totalAmount,
        notes,
        items: items.map((item) => ({
          productId: item.materialId,
          materialId: item.materialId,
          variantId: item.variantId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          purchasePrice: Number(item.purchasePrice),
          billingBasis: item.billingBasis,
          discountAmount: Number(item.discountAmount ?? 0),
          discount: Number(item.discountAmount ?? 0),
          hsnCode: item.hsnCode || undefined,
          gstRate: Number(item.gstRate ?? 0),
          batchNumber: item.batchNumber || undefined,
          expiryDate: item.expiryDate || undefined,
          barcode: item.barcode || undefined,
          grossWeight: Number(item.grossWeight ?? 0),
          tareWeight: Number(item.tareWeight ?? 0),
          netWeight: Number(item.netWeight ?? 0),
        })),
      })
      if (redirectOnSuccess) {
        const successText = language === 'hi' ? '????? ??????????? ????? ????' : 'Order created successfully'
        setSuccessMessage(successText)
        window.setTimeout(() => {
          router.push('/orders')
        }, 1200)
      } else {
        onSuccess?.()
      }
    } catch (err: any) {
      if (err?.code === 'ECONNABORTED') {
        setError('Request timed out. Order may still be saved; please check Orders once before retrying.')
        return
      }
      setError(err.response?.data?.error ?? (language === 'hi' ? '????? ????? ???? ???' : 'Failed to create order'))
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel()
      return
    }
    router.back()
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {successMessage}
        </div>
      ) : null}
      <Card>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">{language === 'hi' ? '????? ?????' : 'Order details'}</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-stone-500">{language === 'hi' ? '?????? *' : 'Customer *'}</label>
            <select
              value={customerId}
              onFocus={() => setShouldLoadCustomers(true)}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              required
            >
              <option value="">
                {customersLoading
                  ? (language === 'hi' ? '?????? ??? ?? ??? ???...' : 'Loading customers...')
                  : (language === 'hi' ? '?????? ?????...' : 'Select customer...')}
              </option>
              {(customers ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.phone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-500">{language === 'hi' ? 'Source location' : 'Source location'}</label>
            <select
              value={sourceLocationId}
              onChange={(e) => setSourceLocationId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">
                {defaultLocation
                  ? `Auto (Default: ${defaultLocation.name})`
                  : 'Auto (Use default location)'}
              </option>
              {activeLocations.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {locationLabel(loc)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-500">Referred by partner</label>
            <select
              value={referralPartnerId}
              onFocus={() => setShouldLoadPartners(true)}
              onChange={(e) => setReferralPartnerId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">
                {partnersLoading ? 'Loading partners...' : 'No referral partner'}
              </option>
              {(referralPartners ?? []).map((partner: any) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name} - {partner.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-500">{language === 'hi' ? '??????? ????' : 'Delivery date'}</label>
            <div className="relative">
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                min={minDeliveryDate}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          {showGst ? (
            <div>
              <label className="mb-1 block text-xs text-stone-500">Tax mode</label>
              <div className="inline-flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                  isInterState
                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                }`}>
                  {isInterState ? 'Inter-state tax (IGST)' : 'Intra-state tax (CGST+SGST)'}
                </span>
                <span
                  className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-stone-300 text-[11px] font-semibold text-stone-600 dark:border-slate-600 dark:text-slate-300"
                  title="Tax mode is auto-detected from the first two digits (state code) of business GSTIN and customer GSTIN."
                  aria-label="Tax mode is auto-detected from GSTIN state codes"
                >
                  i
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {selectedCustomer && selectedCustomer.balance > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {selectedCustomer.name} {language === 'hi' ? '?? ????? ??????' : 'has outstanding balance of'} {fmt(selectedCustomer.balance)}.
            {selectedCustomer.balance >= Number(selectedCustomer.creditLimit) && (language === 'hi' ? ' ??????? ???? ???? ?? ???? ???' : ' Credit limit reached.')}
          </div>
        )}
      </Card>

      {showGst ? (
        <Card>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">Tax preview</div>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div><div className="text-xs text-stone-500">Subtotal</div><div className="font-medium">{fmt(preview.subtotal)}</div></div>
            <div><div className="text-xs text-stone-500">Discount</div><div className="font-medium">-{fmt(preview.totalDiscount)}</div></div>
            <div><div className="text-xs text-stone-500">Taxable value</div><div className="font-medium">{fmt(preview.totalTaxable)}</div></div>
            <div><div className="text-xs text-stone-500">{isInterState ? 'CGST (9%)' : 'CGST'}</div><div className="font-medium">{isInterState ? '-' : fmt(preview.totalCgst)}</div></div>
            <div><div className="text-xs text-stone-500">{isInterState ? 'SGST (9%)' : 'SGST'}</div><div className="font-medium">{isInterState ? '-' : fmt(preview.totalSgst)}</div></div>
            <div><div className="text-xs text-stone-500">{isInterState ? 'IGST (18%)' : 'IGST'}</div><div className="font-medium">{isInterState ? fmt(preview.totalIgst) : '-'}</div></div>
            <div><div className="text-xs text-stone-500">Total tax</div><div className="font-medium">{fmt(preview.totalTax)}</div></div>
            <div><div className="text-xs text-stone-500">Total</div><div className="font-medium">{fmt(preview.grandTotal)}</div></div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">{language === 'hi' ? '????? ??????' : 'Order items'}</div>
        {showBarcode ? (
          <div className="mb-3">
            <div className="flex gap-2">
              <input
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onFocus={() => setShouldLoadMaterials(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleBarcodeScan()
                  }
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder={language === 'hi' ? 'बारकोड स्कैन करें या टाइप करके Enter दबाएं' : 'Scan barcode or type it and press Enter'}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleBarcodeScan}
                className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {language === 'hi' ? 'जोड़ें' : 'Add'}
              </button>
            </div>
            {scanFeedback ? (
              <div className={`mt-1 text-xs ${scanFeedback.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {scanFeedback.text}
              </div>
            ) : null}
          </div>
        ) : null}
        {inStockProducts.length === 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {language === 'hi'
              ? '?? ?????? ??? ??? ????? ?????? ???? ??? ????? ????? ?????? ??????'
              : 'No stock is available in this location. Please choose another location.'}
          </div>
        ) : null}
        <div>
          <div className="mb-1 hidden min-w-full grid-cols-12 gap-2 px-1 text-[10px] text-stone-400 sm:grid sm:min-w-[640px]">
            <div className="col-span-4">{language === 'hi' ? '???????' : 'Material'}</div>
            <div className="col-span-2">{language === 'hi' ? '??????' : 'Qty'}</div>
            <div className="col-span-2">{language === 'hi' ? '??? (??)' : 'Rate (Rs)'}</div>
            <div className="col-span-3">{language === 'hi' ? '????' : 'Amount'}</div>
            <div />
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="mb-2 min-w-full rounded-lg border border-stone-100 p-2 dark:border-slate-800 sm:min-w-[640px]">
              <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
              <div className="col-span-1 sm:col-span-4">
                <select
                    value={item.materialId}
                    onFocus={() => setShouldLoadMaterials(true)}
                    onChange={(e) => updateItem(idx, 'materialId', e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">
                    {materialsLoading
                      ? (language === 'hi' ? '???????? ??? ?? ??? ???...' : 'Loading materials...')
                      : (language === 'hi' ? '?????...' : 'Select...')}
                  </option>
                  {products
                    .filter((m) => Number(m.stockQty) > 0 || m.id === item.materialId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.stockQty} {m.unit} in stock)
                      </option>
                    ))}
                </select>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <input
                  type="number"
                  value={item.quantity}
                  min={0.01}
                  step={0.01}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <input
                  type="number"
                  value={item.unitPrice}
                  min={0}
                  onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="col-span-1 rounded-lg bg-stone-50 px-2 py-1.5 text-xs font-medium text-stone-700 dark:bg-slate-900 dark:text-slate-300 sm:col-span-3">
                {fmt(item.quantity * item.unitPrice)}
              </div>
              <div className="col-span-1 flex justify-end sm:justify-center">
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-sm text-stone-300 transition-colors hover:text-red-500"
                  >
                    x
                  </button>
                )}
              </div>
              </div>
              {showAdvancedLineFields ? (
                <div className="mt-3 space-y-3 border-t border-stone-100 pt-3 dark:border-slate-800">
                  {(showBatch || showExpiry || showBarcode || showSerial) ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {showBatch ? (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">
                            {language === 'hi' ? '??? ????' : 'Batch'}
                          </label>
                          <input
                            type="text"
                            value={item.batchNumber ?? ''}
                            onChange={(e) => updateItem(idx, 'batchNumber', e.target.value)}
                            placeholder={language === 'hi' ? '??? ????' : 'Batch number'}
                            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                      ) : null}
                      {showExpiry ? (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">
                            {language === 'hi' ? '?????? ????' : 'Expiry'}
                          </label>
                          <input
                            type="date"
                            value={item.expiryDate ?? ''}
                            onChange={(e) => updateItem(idx, 'expiryDate', e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                      ) : null}
                      {showBarcode ? (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">
                            {language === 'hi' ? '??????' : 'Barcode'}
                          </label>
                          <input
                            type="text"
                            value={item.barcode ?? ''}
                            onChange={(e) => updateItem(idx, 'barcode', e.target.value)}
                            placeholder={language === 'hi' ? '??????' : 'Barcode'}
                            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                      ) : null}
                      {showSerial ? (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">
                            {language === 'hi' ? '?????? / IMEI' : 'Serial / IMEI'}
                          </label>
                          <input
                            type="text"
                            value={item.serialOrImei ?? ''}
                            onChange={(e) => updateItem(idx, 'serialOrImei', e.target.value)}
                            placeholder={language === 'hi' ? '?????? / IMEI' : 'Serial / IMEI'}
                            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {showWeight || item.billingBasis === 'WEIGHT' ? (
                    <div>
                      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                        {language === 'hi' ? '???' : 'Weight'}
                        {item.billingBasis === 'WEIGHT' ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            {language === 'hi' ? '??? ?? ??????? ??' : 'Billed by net weight — required'}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
                        <div>
                          <label className="mb-1 block truncate text-[10px] text-stone-400">
                            {language === 'hi' ? '???? ???' : 'Gross'}
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.grossWeight ?? 0}
                            onChange={(e) => updateItem(idx, 'grossWeight', e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block truncate text-[10px] text-stone-400">
                            {language === 'hi' ? '???? ???' : 'Tare'}
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.tareWeight ?? 0}
                            onChange={(e) => updateItem(idx, 'tareWeight', e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block truncate text-[10px] text-stone-400">
                            {language === 'hi' ? '??? ???' : 'Net'}
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.netWeight ?? 0}
                            onChange={(e) => updateItem(idx, 'netWeight', e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showGst ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
                    HSN: {item.hsnCode || 'N/A'}
                  </span>
                  <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
                    GST: {item.isExempted ? 'Exempted' : `${Number(item.gstRate ?? 0)}%`}
                  </span>
                  {!item.hsnCode ? (
                    <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                      HSN not configured
                    </span>
                  ) : null}
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.discountAmount ?? 0}
                    onChange={(e) => updateItem(idx, 'discountAmount', e.target.value)}
                    placeholder="Discount"
                    className="w-28 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={addItem} className="mt-1 text-xs text-blue-600 hover:underline">
          {language === 'hi' ? '+ ???? ??????' : '+ Add item'}
        </button>

        <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 dark:border-stone-800">
          <div className="text-xs text-stone-500">{language === 'hi' ? '????? ???' : 'Order total'}</div>
          <div className="text-lg font-medium text-stone-900 dark:text-stone-100">{fmt(totalAmount)}</div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">{language === 'hi' ? '??????' : 'Payment'}</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {PAYMENT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setPaymentMode(m)
                if (m === 'CASH' || m === 'UPI' || m === 'CHEQUE') setAmountPaid(totalAmount)
                if (m === 'CREDIT') setAmountPaid(0)
              }}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                paymentMode === m
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-900'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-stone-500">{language === 'hi' ? '??? ?????? ???? (??)' : 'Amount paid now (Rs)'}</label>
            <input
              type="number"
              value={amountPaid}
              min={0}
              max={totalAmount}
              onChange={(e) => setAmountPaid(Number(e.target.value))}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-col justify-end">
            <div className="text-xs text-stone-500">{language === 'hi' ? '??? (????)' : 'Remaining (udhar)'}</div>
            <div className={`mt-1 text-base font-medium ${totalDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalDue)}</div>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-stone-500">{language === 'hi' ? '????? (????????)' : 'Notes (optional)'}</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={language === 'hi' ? '??? ????? ???????...' : 'Any special instructions...'}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      </Card>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950">{error}</div>}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={createOrder.isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {createOrder.isPending ? (language === 'hi' ? '??? ?? ??? ??...' : 'Saving...') : (language === 'hi' ? '????? ??? ???? ?? ????? ?????' : 'Save order & generate challan')}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-stone-200 px-5 py-2 text-sm transition-colors hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {language === 'hi' ? '???? ????' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}
