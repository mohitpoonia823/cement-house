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

import { fromPaise, multiplyMoney, percentOfMoney, roundMoney, toPaise } from './money'

export function computeOrderPreview(
  lines: OrderLineInput[],
  isInterState: boolean,
  gstEnabled: boolean
): OrderSummary {
  // Totals accumulate in integer paise so repeated additions never drift.
  let subtotalP = 0
  let totalDiscountP = 0
  let totalTaxableP = 0
  let totalCgstP = 0
  let totalSgstP = 0
  let totalIgstP = 0

  const computedLines: OrderLineResult[] = lines.map((line) => {
    const quantity = Number(line.quantity)
    const unitPrice = Number(line.unitPrice)
    const discountAmount = roundMoney(Math.max(0, Number(line.discountAmount)))
    const grossAmount = multiplyMoney(quantity, unitPrice)
    const discountedAmount = fromPaise(Math.max(0, toPaise(grossAmount) - toPaise(discountAmount)))
    const taxableAmount = discountedAmount

    const lineGstRate = gstEnabled && !line.isExempted ? Math.max(0, Number(line.gstRate)) : 0
    const cgstRate = gstEnabled && !line.isExempted && !isInterState ? roundMoney(lineGstRate / 2) : 0
    const sgstRate = gstEnabled && !line.isExempted && !isInterState ? roundMoney(lineGstRate / 2) : 0
    const igstRate = gstEnabled && !line.isExempted && isInterState ? lineGstRate : 0

    const gstAmount = percentOfMoney(taxableAmount, lineGstRate)
    const cgstAmount = !isInterState ? roundMoney(gstAmount / 2) : 0
    const sgstAmount = !isInterState ? roundMoney(gstAmount / 2) : 0
    const igstAmount = isInterState ? gstAmount : 0
    const totalTax = fromPaise(toPaise(cgstAmount) + toPaise(sgstAmount) + toPaise(igstAmount))
    const lineTotal = fromPaise(toPaise(taxableAmount) + toPaise(totalTax))

    subtotalP += toPaise(grossAmount)
    totalDiscountP += toPaise(discountAmount)
    totalTaxableP += toPaise(taxableAmount)
    totalCgstP += toPaise(cgstAmount)
    totalSgstP += toPaise(sgstAmount)
    totalIgstP += toPaise(igstAmount)

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

  const totalTaxP = totalCgstP + totalSgstP + totalIgstP
  const grandTotalP = totalTaxableP + totalTaxP
  const grandTotal = fromPaise(grandTotalP)
  const roundOff = fromPaise(Math.round(grandTotal) * 100 - grandTotalP)

  return {
    lines: computedLines,
    subtotal: fromPaise(subtotalP),
    totalDiscount: fromPaise(totalDiscountP),
    totalTaxable: fromPaise(totalTaxableP),
    totalCgst: fromPaise(totalCgstP),
    totalSgst: fromPaise(totalSgstP),
    totalIgst: fromPaise(totalIgstP),
    totalTax: fromPaise(totalTaxP),
    grandTotal,
    roundOff,
    isInterState,
  }
}
