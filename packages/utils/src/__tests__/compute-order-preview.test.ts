import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeOrderPreview } from '../compute-order-preview.ts'

describe('computeOrderPreview', () => {
  it('intra-state 18% GST on 1000 with 100 discount', () => {
    const result = computeOrderPreview(
      [{ quantity: 1, unitPrice: 1000, discountAmount: 100, gstRate: 18, hsnCode: '2523', isExempted: false }],
      false,
      true
    )
    assert.equal(result.totalTaxable, 900)
    assert.equal(result.totalCgst, 81)
    assert.equal(result.totalSgst, 81)
    assert.equal(result.totalIgst, 0)
    assert.equal(result.totalTax, 162)
    assert.equal(result.grandTotal, 1062)
  })

  it('inter-state 12% GST', () => {
    const result = computeOrderPreview(
      [{ quantity: 2, unitPrice: 500, discountAmount: 0, gstRate: 12, hsnCode: '2523', isExempted: false }],
      true,
      true
    )
    assert.equal(result.totalTaxable, 1000)
    assert.equal(result.totalCgst, 0)
    assert.equal(result.totalSgst, 0)
    assert.equal(result.totalIgst, 120)
    assert.equal(result.totalTax, 120)
    assert.equal(result.grandTotal, 1120)
  })

  it('exempted item mixed with taxable item', () => {
    const result = computeOrderPreview(
      [
        { quantity: 1, unitPrice: 1000, discountAmount: 0, gstRate: 18, hsnCode: '2523', isExempted: false },
        { quantity: 1, unitPrice: 500, discountAmount: 0, gstRate: 18, hsnCode: '9999', isExempted: true },
      ],
      false,
      true
    )
    assert.equal(result.totalTaxable, 1500)
    assert.equal(result.totalTax, 180)
    assert.equal(result.lines[1].totalTax, 0)
    assert.equal(result.grandTotal, 1680)
  })

  it('gstEnabled=false sets all taxes to zero', () => {
    const result = computeOrderPreview(
      [{ quantity: 1, unitPrice: 1000, discountAmount: 100, gstRate: 18, hsnCode: '2523', isExempted: false }],
      false,
      false
    )
    assert.equal(result.totalTaxable, 900)
    assert.equal(result.totalCgst, 0)
    assert.equal(result.totalSgst, 0)
    assert.equal(result.totalIgst, 0)
    assert.equal(result.totalTax, 0)
    assert.equal(result.grandTotal, 900)
  })

  it('applies round-off to nearest rupee', () => {
    const result = computeOrderPreview(
      [{ quantity: 1, unitPrice: 100, discountAmount: 0, gstRate: 18, hsnCode: '2523', isExempted: false }],
      false,
      true
    )
    assert.equal(result.grandTotal, 118)
    assert.equal(result.roundOff, 0)

    const fractional = computeOrderPreview(
      [{ quantity: 1, unitPrice: 99.99, discountAmount: 0, gstRate: 18, hsnCode: '2523', isExempted: false }],
      false,
      true
    )
    assert.equal(fractional.grandTotal, 117.99)
    assert.equal(fractional.roundOff, 0.01)
  })
})
