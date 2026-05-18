import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeOrderPreview } from '../../packages/utils/src/compute-order-preview.ts'

type Product = {
  id: string
  name: string
  hsnCode: string
  gstRate: number
  price: number
}

type Customer = {
  id: string
  gstin: string | null
}

type OrderLineInput = {
  product: Product
  quantity: number
  discountAmount?: number
}

function stateCodeFromGstin(gstin?: string | null) {
  const v = String(gstin ?? '').trim()
  const match = v.match(/^(\d{2})[A-Za-z0-9]{13}$/)
  return match ? match[1] : null
}

function buildOrderPayload(input: {
  gstBilling: boolean
  storeStateCode: string
  customer: Customer | null
  items: OrderLineInput[]
}) {
  const customerStateCode = stateCodeFromGstin(input.customer?.gstin ?? null)
  const isInterState = input.customer ? input.storeStateCode !== (customerStateCode ?? input.storeStateCode) : false
  return {
    gstEnabled: input.gstBilling,
    isInterState,
    customerId: input.customer?.id ?? null,
    customerGstin: input.customer?.gstin ?? null,
    items: input.items.map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
      unitPrice: line.product.price,
      discountAmount: line.discountAmount ?? 0,
      hsnCode: line.product.hsnCode,
      gstRate: line.product.gstRate,
    })),
  }
}

function simulateOrderApiResponse(payload: ReturnType<typeof buildOrderPayload>) {
  const summary = computeOrderPreview(
    payload.items.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      gstRate: line.gstRate,
      hsnCode: line.hsnCode,
      isExempted: line.gstRate === 0,
    })),
    payload.isInterState,
    payload.gstEnabled
  )

  return {
    taxSummary: {
      cgst: summary.totalCgst,
      sgst: summary.totalSgst,
      igst: summary.totalIgst,
    },
    taxableAmount: summary.totalTaxable,
    grandTotal: summary.grandTotal,
    lines: summary.lines,
  }
}

describe('GST order flow integration', () => {
  it('Scenario 1 — Intra-state B2C pharmacy order', () => {
    const payload = buildOrderPayload({
      gstBilling: true,
      storeStateCode: '27',
      customer: null,
      items: [
        {
          product: { id: 'p1', name: 'Paracetamol', hsnCode: '3004', gstRate: 12, price: 100 },
          quantity: 5,
        },
      ],
    })
    const response = simulateOrderApiResponse(payload)

    assert.equal(payload.gstEnabled, true)
    assert.equal(payload.isInterState, false)
    assert.equal(payload.items[0].hsnCode, '3004')
    assert.equal(payload.items[0].gstRate, 12)
    assert.equal(response.taxSummary.cgst, 30)
    assert.equal(response.taxSummary.sgst, 30)
    assert.equal(response.taxSummary.igst, 0)
    assert.equal(response.grandTotal, 560)
  })

  it('Scenario 2 — Inter-state B2B hardware order', () => {
    const payload = buildOrderPayload({
      gstBilling: true,
      storeStateCode: '27',
      customer: { id: 'c1', gstin: '29ABCDE1234F1Z5' },
      items: [
        {
          product: { id: 'p2', name: 'GI Pipe', hsnCode: '7306', gstRate: 18, price: 1000 },
          quantity: 3,
          discountAmount: 150,
        },
      ],
    })
    const response = simulateOrderApiResponse(payload)

    assert.equal(payload.isInterState, true)
    assert.equal(response.taxableAmount, 2850)
    assert.equal(response.taxSummary.igst, 513)
    assert.equal(response.taxSummary.cgst, 0)
    assert.equal(response.taxSummary.sgst, 0)
    assert.equal(response.grandTotal, 3363)
  })

  it('Scenario 3 — Mixed GST rates (gift store hamper)', () => {
    const payload = buildOrderPayload({
      gstBilling: true,
      storeStateCode: '27',
      customer: { id: 'c2', gstin: '27ABCDE1234F1Z5' },
      items: [
        { product: { id: 'p3', name: 'Candle', hsnCode: '3406', gstRate: 12, price: 200 }, quantity: 2 },
        { product: { id: 'p4', name: 'Chocolate box', hsnCode: '1806', gstRate: 18, price: 500 }, quantity: 1 },
      ],
    })
    const response = simulateOrderApiResponse(payload)

    assert.equal(response.lines[0].cgstAmount, 24)
    assert.equal(response.lines[0].sgstAmount, 24)
    assert.equal(response.lines[1].cgstAmount, 45)
    assert.equal(response.lines[1].sgstAmount, 45)
    assert.equal(response.taxSummary.cgst, 69)
    assert.equal(response.taxSummary.sgst, 69)
  })

  it('Scenario 4 — GST disabled (composition dealer store)', () => {
    const payload = buildOrderPayload({
      gstBilling: false,
      storeStateCode: '27',
      customer: { id: 'c3', gstin: '27ABCDE1234F1Z5' },
      items: [
        { product: { id: 'p5', name: 'Any item', hsnCode: '9999', gstRate: 18, price: 250 }, quantity: 4 },
      ],
    })
    const response = simulateOrderApiResponse(payload)

    assert.equal(payload.gstEnabled, false)
    assert.equal(response.taxSummary.cgst, 0)
    assert.equal(response.taxSummary.sgst, 0)
    assert.equal(response.taxSummary.igst, 0)
    assert.equal(response.grandTotal, 1000)
  })
})
