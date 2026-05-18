import { computeOrderPreview } from '@cement-house/utils'

export type BillingFeatureFlags = Partial<{
  gstBilling: boolean
  weightBilling: boolean
  barcode: boolean
  batchTracking: boolean
  expiryTracking: boolean
  serialTracking: boolean
  imeiTracking: boolean
  kitchenOrders: boolean
}>

export interface BillingLineInput {
  materialId: string
  quantity: number
  unitPrice: number
  purchasePrice?: number
  discount?: number
  gstRate?: number
  barcode?: string
  batchNumber?: string
  expiryDate?: string
  serialNumber?: string
  imeiNumber?: string
  grossWeight?: number
  tareWeight?: number
  netWeight?: number
}

export interface BillingInput {
  items: BillingLineInput[]
  paymentMode: 'CASH' | 'UPI' | 'CHEQUE' | 'CREDIT' | 'PARTIAL'
  paidAmount: number
  invoiceDiscount?: number
  roundOff?: number
  transportCharges?: number
  loadingCharges?: number
  gstEnabled?: boolean
  isInterState?: boolean
  allowAdvancePayment?: boolean
  featureFlags?: BillingFeatureFlags | null
}

export interface BillingLineComputed {
  materialId: string
  quantity: number
  deductionQty: number
  unitPrice: number
  purchasePrice: number
  itemSubtotal: number
  itemDiscount: number
  taxableAmount: number
  gstRate: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  gstAmount: number
  lineTotal: number
  grossWeight?: number
  tareWeight?: number
  netWeight?: number
}

export interface BillingComputed {
  lines: BillingLineComputed[]
  subtotal: number
  itemDiscountTotal: number
  invoiceDiscount: number
  taxableTotal: number
  cgstTotal: number
  sgstTotal: number
  igstTotal: number
  gstTotal: number
  transportCharges: number
  loadingCharges: number
  roundOff: number
  grandTotal: number
  paidAmount: number
  dueAmount: number
  creditSale: boolean
}

// Reserved for future sales-return workflow integration.
export interface SalesReturnLineDraft {
  orderId: string
  materialId: string
  returnQuantity: number
  returnAmount: number
  addBackToStock: boolean
  adjustLedger: boolean
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function bool(flag: unknown) {
  return flag === true
}

export function calculateInvoice(input: BillingInput): BillingComputed {
  const flags = input.featureFlags ?? {}
  const isWeightBilling = bool(flags.weightBilling)
  const gstEnabled = input.gstEnabled ?? bool(flags.gstBilling)
  const isInterState = input.isInterState === true

  let subtotal = 0

  const prepared = input.items.map((item) => {
    const qty = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const purchasePrice = Number(item.purchasePrice ?? 0)
    const grossWeight = item.grossWeight != null ? Number(item.grossWeight) : undefined
    const tareWeight = item.tareWeight != null ? Number(item.tareWeight) : undefined
    const netWeight = item.netWeight != null ? Number(item.netWeight) : (grossWeight != null && tareWeight != null ? Math.max(0, grossWeight - tareWeight) : undefined)
    const deductionQty = isWeightBilling ? Number(netWeight ?? qty) : qty
    const itemSubtotal = round2(deductionQty * unitPrice)

    subtotal += itemSubtotal
    return { item, qty, unitPrice, purchasePrice, deductionQty, itemSubtotal, grossWeight, tareWeight, netWeight }
  })

  const preview = computeOrderPreview(
    prepared.map((row) => ({
      quantity: row.deductionQty,
      unitPrice: row.unitPrice,
      discountAmount: Number(row.item.discount ?? 0),
      gstRate: Number(row.item.gstRate ?? 0),
      hsnCode: '',
      isExempted: false,
    })),
    isInterState,
    gstEnabled
  )

  const lines: BillingLineComputed[] = prepared.map((row, index) => {
    const tax = preview.lines[index]
    return {
      materialId: row.item.materialId,
      quantity: row.qty,
      deductionQty: row.deductionQty,
      unitPrice: row.unitPrice,
      purchasePrice: row.purchasePrice,
      itemSubtotal: row.itemSubtotal,
      itemDiscount: tax.discountAmount,
      taxableAmount: tax.taxableAmount,
      gstRate: tax.cgstRate + tax.sgstRate + tax.igstRate,
      cgstAmount: tax.cgstAmount,
      sgstAmount: tax.sgstAmount,
      igstAmount: tax.igstAmount,
      gstAmount: tax.totalTax,
      lineTotal: tax.lineTotal,
      grossWeight: row.grossWeight,
      tareWeight: row.tareWeight,
      netWeight: row.netWeight,
    }
  })

  subtotal = round2(subtotal)
  const itemDiscountTotal = round2(preview.totalDiscount)
  const taxableTotal = round2(preview.totalTaxable)
  const cgstTotal = round2(preview.totalCgst)
  const sgstTotal = round2(preview.totalSgst)
  const igstTotal = round2(preview.totalIgst)
  const gstTotal = round2(cgstTotal + sgstTotal + igstTotal)

  const invoiceDiscount = round2(Number(input.invoiceDiscount ?? 0))
  const transportCharges = round2(Number(input.transportCharges ?? 0))
  const loadingCharges = round2(Number(input.loadingCharges ?? 0))
  const roundOff = round2(Number(input.roundOff ?? 0))
  const beforeRound = round2(taxableTotal - invoiceDiscount + gstTotal + transportCharges + loadingCharges)
  const grandTotal = round2(Math.max(0, beforeRound + roundOff))
  const paidAmount = round2(Number(input.paidAmount ?? 0))
  const dueAmount = round2(Math.max(0, grandTotal - paidAmount))

  return {
    lines,
    subtotal,
    itemDiscountTotal,
    invoiceDiscount,
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    gstTotal,
    transportCharges,
    loadingCharges,
    roundOff,
    grandTotal,
    paidAmount,
    dueAmount,
    creditSale: dueAmount > 0,
  }
}

export function validateInvoiceInput(input: BillingInput): string | null {
  if (!Array.isArray(input.items) || input.items.length === 0) return 'At least one invoice item is required'
  if (input.paidAmount < 0) return 'paidAmount cannot be negative'
  if ((input.transportCharges ?? 0) < 0) return 'transportCharges cannot be negative'
  if ((input.loadingCharges ?? 0) < 0) return 'loadingCharges cannot be negative'
  if ((input.invoiceDiscount ?? 0) < 0) return 'invoiceDiscount cannot be negative'

  const flags = input.featureFlags ?? {}
  for (const item of input.items) {
    if (item.quantity <= 0) return 'quantity must be greater than 0'
    if (item.unitPrice < 0) return 'unitPrice cannot be negative'
    if ((item.purchasePrice ?? 0) < 0) return 'purchasePrice cannot be negative'
    if ((item.discount ?? 0) < 0) return 'item discount cannot be negative'
    if ((item.gstRate ?? 0) < 0) return 'gstRate cannot be negative'
    if ((item.grossWeight ?? 0) < 0 || (item.tareWeight ?? 0) < 0 || (item.netWeight ?? 0) < 0) return 'weight fields cannot be negative'

    if (flags.batchTracking && !item.batchNumber) return 'batchNumber is required when batch tracking is enabled'
    if (flags.expiryTracking && !item.expiryDate) return 'expiryDate is required when expiry tracking is enabled'
    if (flags.serialTracking && !item.serialNumber && !item.imeiNumber) {
      return 'serialNumber or imeiNumber is required when serial tracking is enabled'
    }
    if (flags.imeiTracking && !item.imeiNumber) return 'imeiNumber is required when IMEI tracking is enabled'
  }

  const computed = calculateInvoice(input)
  if (input.allowAdvancePayment !== true && computed.paidAmount > computed.grandTotal) {
    return 'paidAmount cannot exceed invoice total unless advance payment is allowed'
  }
  return null
}
