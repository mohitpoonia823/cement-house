import { addMoney, computeOrderPreview, multiplyMoney, roundMoney, subtractMoney } from '@cement-house/utils'

export type BillingFeatureFlags = Partial<{
  gstBilling: boolean
  weightBilling: boolean
  barcode: boolean
  batchTracking: boolean
  expiryTracking: boolean
  serialTracking: boolean
  imeiTracking: boolean
  kitchenOrders: boolean
  transport: boolean
  transportManagement: boolean
  deliveryChallan: boolean
}>

export interface BillingLineInput {
  materialId: string
  quantity: number
  unitPrice: number
  purchasePrice?: number
  // How this line is billed. Defaults to the business-level weight flag when absent
  // (back-compat); when present, the product's own basis wins.
  billingBasis?: 'QUANTITY' | 'WEIGHT'
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
  // Unit identity, preserved into the stored billingSnapshot so each invoice
  // records exactly which batch/serial was sold (pharmacy & electronics trail).
  batchNumber?: string
  expiryDate?: string
  serialNumber?: string
  imeiNumber?: string
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

function bool(flag: unknown) {
  return flag === true
}

// The positive net weight for a line, or undefined if none was entered.
function resolveNetWeight(item: BillingLineInput): number | undefined {
  const grossWeight = item.grossWeight != null ? Number(item.grossWeight) : undefined
  const tareWeight = item.tareWeight != null ? Number(item.tareWeight) : undefined
  const raw = item.netWeight != null
    ? Number(item.netWeight)
    : (grossWeight != null && tareWeight != null ? Math.max(0, grossWeight - tareWeight) : undefined)
  return raw != null && raw > 0 ? raw : undefined
}

// Per-line billing basis: the product's own setting wins; otherwise fall back to
// the legacy business-wide weight flag.
function resolveBasis(item: BillingLineInput, isWeightBilling: boolean): 'QUANTITY' | 'WEIGHT' {
  if (item.billingBasis === 'WEIGHT' || item.billingBasis === 'QUANTITY') return item.billingBasis
  return isWeightBilling ? 'WEIGHT' : 'QUANTITY'
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
    const netWeight = resolveNetWeight(item)
    // Bill by weight only for weight-basis lines that carry a positive net weight;
    // otherwise bill by quantity. WEIGHT lines missing a weight are rejected upfront
    // by validateInvoiceInput, so this fallback never silently under-bills a real sale.
    const basis = resolveBasis(item, isWeightBilling)
    const deductionQty = basis === 'WEIGHT' && netWeight != null ? netWeight : qty
    const itemSubtotal = multiplyMoney(deductionQty, unitPrice)

    subtotal = addMoney(subtotal, itemSubtotal)
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
      batchNumber: row.item.batchNumber || undefined,
      expiryDate: row.item.expiryDate || undefined,
      serialNumber: row.item.serialNumber || undefined,
      imeiNumber: row.item.imeiNumber || undefined,
    }
  })

  const itemDiscountTotal = roundMoney(preview.totalDiscount)
  const taxableTotal = roundMoney(preview.totalTaxable)
  const cgstTotal = roundMoney(preview.totalCgst)
  const sgstTotal = roundMoney(preview.totalSgst)
  const igstTotal = roundMoney(preview.totalIgst)
  const gstTotal = addMoney(cgstTotal, sgstTotal, igstTotal)

  const invoiceDiscount = roundMoney(Number(input.invoiceDiscount ?? 0))
  const transportCharges = roundMoney(Number(input.transportCharges ?? 0))
  const loadingCharges = roundMoney(Number(input.loadingCharges ?? 0))
  const roundOff = roundMoney(Number(input.roundOff ?? 0))
  const beforeRound = subtractMoney(addMoney(taxableTotal, gstTotal, transportCharges, loadingCharges), invoiceDiscount)
  const grandTotal = Math.max(0, addMoney(beforeRound, roundOff))
  const paidAmount = roundMoney(Number(input.paidAmount ?? 0))
  const dueAmount = Math.max(0, subtractMoney(grandTotal, paidAmount))

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

  // Freight is a transport-vertical concept; reject rather than silently zero
  // so the caller's previewed total never diverges from the stored invoice.
  const transportAllowed = bool(flags.transport) || bool(flags.transportManagement) || bool(flags.deliveryChallan)
  if (!transportAllowed && ((input.transportCharges ?? 0) > 0 || (input.loadingCharges ?? 0) > 0)) {
    return 'Transport/loading charges require the transport feature — enable it in Settings'
  }

  const isWeightBilling = bool(flags.weightBilling)
  for (const [index, item] of input.items.entries()) {
    if (item.quantity <= 0) return 'quantity must be greater than 0'
    if (item.unitPrice < 0) return 'unitPrice cannot be negative'
    if ((item.purchasePrice ?? 0) < 0) return 'purchasePrice cannot be negative'
    if ((item.discount ?? 0) < 0) return 'item discount cannot be negative'
    if ((item.gstRate ?? 0) < 0) return 'gstRate cannot be negative'
    if ((item.grossWeight ?? 0) < 0 || (item.tareWeight ?? 0) < 0 || (item.netWeight ?? 0) < 0) return 'weight fields cannot be negative'

    // A weight-billed line must carry a positive net weight, otherwise the invoice
    // total would silently collapse. Fail loudly instead of guessing.
    if (resolveBasis(item, isWeightBilling) === 'WEIGHT' && resolveNetWeight(item) == null) {
      return `Enter a net weight for line ${index + 1} — it is sold by weight`
    }

    if (flags.batchTracking && !item.batchNumber) return 'batchNumber is required when batch tracking is enabled'
    if (flags.expiryTracking && !item.expiryDate) return 'expiryDate is required when expiry tracking is enabled'
    if (flags.serialTracking && !item.serialNumber && !item.imeiNumber) {
      return 'serialNumber or imeiNumber is required when serial tracking is enabled'
    }
    if (flags.imeiTracking && !item.imeiNumber) return 'imeiNumber is required when IMEI tracking is enabled'
    if (item.imeiNumber && !/^\d{15}$/.test(item.imeiNumber.trim())) {
      return `IMEI on line ${index + 1} must be exactly 15 digits`
    }
  }

  // A serialised unit is unique — the same serial/IMEI twice on one invoice
  // is always a data-entry mistake.
  if (bool(flags.serialTracking) || bool(flags.imeiTracking)) {
    const seenIdentifiers = new Set<string>()
    for (const item of input.items) {
      for (const identifier of [item.serialNumber?.trim(), item.imeiNumber?.trim()]) {
        if (!identifier) continue
        if (seenIdentifiers.has(identifier)) return `Serial/IMEI ${identifier} appears on more than one line`
        seenIdentifiers.add(identifier)
      }
    }
  }

  const computed = calculateInvoice(input)
  if (input.allowAdvancePayment !== true && computed.paidAmount > computed.grandTotal) {
    return 'paidAmount cannot exceed invoice total unless advance payment is allowed'
  }
  return null
}
