export interface OrderLineInput {
  quantity: number
  unitPrice: number
  discountAmount: number
  gstRate: number
  hsnCode: string
  isExempted: boolean
}

export interface OrderLineResult extends OrderLineInput {
  grossAmount: number
  discountedAmount: number
  taxableAmount: number
  cgstRate: number
  cgstAmount: number
  sgstRate: number
  sgstAmount: number
  igstRate: number
  igstAmount: number
  totalTax: number
  lineTotal: number
}

export interface OrderSummary {
  lines: OrderLineResult[]
  subtotal: number
  totalDiscount: number
  totalTaxable: number
  totalCgst: number
  totalSgst: number
  totalIgst: number
  totalTax: number
  grandTotal: number
  roundOff: number
  isInterState: boolean
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function computeOrderPreview(
  lines: OrderLineInput[],
  isInterState: boolean,
  gstEnabled: boolean
): OrderSummary {
  let subtotal = 0
  let totalDiscount = 0
  let totalTaxable = 0
  let totalCgst = 0
  let totalSgst = 0
  let totalIgst = 0

  const computedLines: OrderLineResult[] = lines.map((line) => {
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)
    const discountAmount = round2(Math.max(0, Number(line.discountAmount)))
    const grossAmount = round2(quantity * unitPrice)
    const discountedAmount = round2(Math.max(0, grossAmount - discountAmount))
    const taxableAmount = discountedAmount

    const lineGstRate = gstEnabled && !line.isExempted ? Math.max(0, Number(line.gstRate)) : 0
    const cgstRate = gstEnabled && !line.isExempted && !isInterState ? round2(lineGstRate / 2) : 0
    const sgstRate = gstEnabled && !line.isExempted && !isInterState ? round2(lineGstRate / 2) : 0
    const igstRate = gstEnabled && !line.isExempted && isInterState ? lineGstRate : 0

    const gstAmount = round2((taxableAmount * lineGstRate) / 100)
    const cgstAmount = !isInterState ? round2(gstAmount / 2) : 0
    const sgstAmount = !isInterState ? round2(gstAmount / 2) : 0
    const igstAmount = isInterState ? gstAmount : 0
    const totalTax = round2(cgstAmount + sgstAmount + igstAmount)
    const lineTotal = round2(taxableAmount + totalTax)

    subtotal = round2(subtotal + grossAmount)
    totalDiscount = round2(totalDiscount + discountAmount)
    totalTaxable = round2(totalTaxable + taxableAmount)
    totalCgst = round2(totalCgst + cgstAmount)
    totalSgst = round2(totalSgst + sgstAmount)
    totalIgst = round2(totalIgst + igstAmount)

    return {
      ...line,
      discountAmount,
      grossAmount,
      discountedAmount,
      taxableAmount,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalTax,
      lineTotal,
    }
  })

  const totalTax = round2(totalCgst + totalSgst + totalIgst)
  const grandTotal = round2(totalTaxable + totalTax)
  const roundOff = round2(Math.round(grandTotal) - grandTotal)

  return {
    lines: computedLines,
    subtotal,
    totalDiscount,
    totalTaxable,
    totalCgst,
    totalSgst,
    totalIgst,
    totalTax,
    grandTotal,
    roundOff,
    isInterState,
  }
}
