'use client'

import { Card } from '@/components/ui/Card'
import { useCustomers } from '@/hooks/useCustomers'
import { useInventory } from '@/hooks/useInventory'
import { useCreateOrder } from '@/hooks/useOrders'
import { fmt } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type LineItem = {
  materialId: string
  materialName: string
  unit: string
  quantity: number
  unitPrice: number
  purchasePrice: number
}

const PAYMENT_MODES = ['CASH', 'UPI', 'CHEQUE', 'CREDIT', 'PARTIAL']

interface NewOrderFormProps {
  redirectOnSuccess?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}

export function NewOrderForm({ redirectOnSuccess = true, onSuccess, onCancel }: NewOrderFormProps) {
  const router = useRouter()
  const { data: customers } = useCustomers()
  const { data: materials } = useInventory()
  const createOrder = useCreateOrder()

  const [customerId, setCustomerId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [amountPaid, setAmountPaid] = useState(0)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([
    { materialId: '', materialName: '', unit: '', quantity: 1, unitPrice: 0, purchasePrice: 0 },
  ])
  const [error, setError] = useState('')

  const selectedCustomer = (customers ?? []).find((c: any) => c.id === customerId)
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const totalDue = Math.max(0, totalAmount - amountPaid)

  function updateItem(idx: number, field: keyof LineItem, value: any) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        if (field === 'materialId') {
          const mat = (materials ?? []).find((m: any) => m.id === value)
          return mat
            ? {
                ...item,
                materialId: mat.id,
                materialName: mat.name,
                unit: mat.unit,
                unitPrice: Number(mat.salePrice),
                purchasePrice: Number(mat.purchasePrice),
              }
            : { ...item, materialId: value }
        }
        return { ...item, [field]: field === 'quantity' || field === 'unitPrice' ? Number(value) : value }
      })
    )
  }

  function addItem() {
    setItems((prev) => [...prev, { materialId: '', materialName: '', unit: '', quantity: 1, unitPrice: 0, purchasePrice: 0 }])
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!customerId) return setError('Select a customer')
    if (items.some((i) => !i.materialId)) return setError('Select a material for each item')
    if (items.some((i) => i.quantity <= 0)) return setError('Quantity must be greater than 0')
    try {
      await createOrder.mutateAsync({ customerId, deliveryDate: deliveryDate || undefined, paymentMode, amountPaid, notes, items })
      if (redirectOnSuccess) {
        sessionStorage.setItem('orders_success_message', 'Order created successfully')
        router.push('/orders')
      } else {
        onSuccess?.()
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create order')
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
      <Card>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">Order details</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-stone-500">Customer *</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              required
            >
              <option value="">Select customer...</option>
              {(customers ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.phone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-500">Delivery date</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </div>
        </div>

        {selectedCustomer && selectedCustomer.balance > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {selectedCustomer.name} has outstanding balance of {fmt(selectedCustomer.balance)}.
            {selectedCustomer.balance >= Number(selectedCustomer.creditLimit) && ' Credit limit reached.'}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">Order items</div>
        <div className="overflow-x-auto">
          <div className="mb-1 grid min-w-[640px] grid-cols-12 gap-2 px-1 text-[10px] text-stone-400">
            <div className="col-span-4">Material</div>
            <div className="col-span-2">Qty</div>
            <div className="col-span-2">Rate (Rs)</div>
            <div className="col-span-3">Amount</div>
            <div />
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="mb-2 grid min-w-[640px] grid-cols-12 items-center gap-2">
              <div className="col-span-4">
                <select
                  value={item.materialId}
                  onChange={(e) => updateItem(idx, 'materialId', e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                >
                  <option value="">Select...</option>
                  {(materials ?? []).map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.stockQty} {m.unit} in stock)
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.quantity}
                  min={0.01}
                  step={0.01}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  value={item.unitPrice}
                  min={0}
                  onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>
              <div className="col-span-3 rounded-lg bg-stone-50 px-2 py-1.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {fmt(item.quantity * item.unitPrice)}
              </div>
              <div className="col-span-1 flex justify-center">
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
          ))}
        </div>
        <button type="button" onClick={addItem} className="mt-1 text-xs text-blue-600 hover:underline">
          + Add item
        </button>

        <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 dark:border-stone-800">
          <div className="text-xs text-stone-500">Order total</div>
          <div className="text-lg font-medium text-stone-900 dark:text-stone-100">{fmt(totalAmount)}</div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">Payment</div>
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
                  : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-stone-500">Amount paid now (Rs)</label>
            <input
              type="number"
              value={amountPaid}
              min={0}
              max={totalAmount}
              onChange={(e) => setAmountPaid(Number(e.target.value))}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            />
          </div>
          <div className="flex flex-col justify-end">
            <div className="text-xs text-stone-500">Remaining (udhar)</div>
            <div className={`mt-1 text-base font-medium ${totalDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalDue)}</div>
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs text-stone-500">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special instructions..."
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
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
          {createOrder.isPending ? 'Saving...' : 'Save order & generate challan'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-lg border border-stone-200 px-5 py-2 text-sm transition-colors hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
