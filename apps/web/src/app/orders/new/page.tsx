'use client'
import { AppShell }        from '@/components/layout/AppShell'
import { Card }            from '@/components/ui/Card'
import { useCustomers }    from '@/hooks/useCustomers'
import { useInventory }    from '@/hooks/useInventory'
import { useCreateOrder }  from '@/hooks/useOrders'
import { fmt }             from '@/lib/utils'
import { useRouter }       from 'next/navigation'
import { useState }        from 'react'

type LineItem = { materialId: string; materialName: string; unit: string; quantity: number; unitPrice: number; purchasePrice: number }

const PAYMENT_MODES = ['CASH','UPI','CHEQUE','CREDIT','PARTIAL']

export default function NewOrderPage() {
  const router = useRouter()
  const { data: customers } = useCustomers()
  const { data: materials } = useInventory()
  const createOrder = useCreateOrder()

  const [customerId,   setCustomerId]   = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [paymentMode,  setPaymentMode]  = useState('CASH')
  const [amountPaid,   setAmountPaid]   = useState(0)
  const [notes,        setNotes]        = useState('')
  const [items,        setItems]        = useState<LineItem[]>([
    { materialId: '', materialName: '', unit: '', quantity: 1, unitPrice: 0, purchasePrice: 0 }
  ])
  const [error, setError] = useState('')

  const selectedCustomer = (customers ?? []).find((c: any) => c.id === customerId)
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const totalDue    = Math.max(0, totalAmount - amountPaid)

  function updateItem(idx: number, field: keyof LineItem, value: any) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      if (field === 'materialId') {
        const mat = (materials ?? []).find((m: any) => m.id === value)
        return mat
          ? { ...item, materialId: mat.id, materialName: mat.name, unit: mat.unit, unitPrice: Number(mat.salePrice), purchasePrice: Number(mat.purchasePrice) }
          : { ...item, materialId: value }
      }
      return { ...item, [field]: field === 'quantity' || field === 'unitPrice' ? Number(value) : value }
    }))
  }

  function addItem() {
    setItems(prev => [...prev, { materialId: '', materialName: '', unit: '', quantity: 1, unitPrice: 0, purchasePrice: 0 }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!customerId)                 return setError('Select a customer')
    if (items.some(i => !i.materialId)) return setError('Select a material for each item')
    if (items.some(i => i.quantity <= 0)) return setError('Quantity must be greater than 0')
    try {
      await createOrder.mutateAsync({ customerId, deliveryDate: deliveryDate || undefined, paymentMode, amountPaid, notes, items })
      router.push('/orders')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create order')
    }
  }

  return (
    <AppShell>
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
        {/* Customer + date */}
        <Card>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Order details</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Customer *</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required>
                <option value="">Select customer…</option>
                {(customers ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Delivery date</label>
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Credit warning */}
          {selectedCustomer && selectedCustomer.balance > 0 && (
            <div className="mt-3 text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-200">
              {selectedCustomer.name} has outstanding balance of {fmt(selectedCustomer.balance)}.
              {selectedCustomer.balance >= Number(selectedCustomer.creditLimit) && ' Credit limit reached.'}
            </div>
          )}
        </Card>

        {/* Items */}
        <Card>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Order items</div>
          <div className="grid grid-cols-12 gap-2 text-[10px] text-stone-400 mb-1 px-1">
            <div className="col-span-4">Material</div><div className="col-span-2">Qty</div>
            <div className="col-span-2">Rate (₹)</div><div className="col-span-3">Amount</div><div />
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-center">
              <div className="col-span-4">
                <select value={item.materialId} onChange={e => updateItem(idx, 'materialId', e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Select…</option>
                  {(materials ?? []).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.stockQty} {m.unit} in stock)</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input type="number" value={item.quantity} min={0.01} step={0.01}
                  onChange={e => updateItem(idx, 'quantity', e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <input type="number" value={item.unitPrice} min={0}
                  onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                  className="w-full text-xs px-2 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="col-span-3 text-xs font-medium text-stone-700 dark:text-stone-300 px-2 py-1.5 bg-stone-50 dark:bg-stone-800 rounded-lg">
                {fmt(item.quantity * item.unitPrice)}
              </div>
              <div className="col-span-1 flex justify-center">
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)}
                    className="text-stone-300 hover:text-red-500 transition-colors text-sm">✕</button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={addItem}
            className="text-xs text-blue-600 hover:underline mt-1">+ Add item</button>

          {/* Total */}
          <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-between items-center">
            <div className="text-xs text-stone-500">Order total</div>
            <div className="text-lg font-medium text-stone-900 dark:text-stone-100">{fmt(totalAmount)}</div>
          </div>
        </Card>

        {/* Payment */}
        <Card>
          <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Payment</div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {PAYMENT_MODES.map(m => (
              <button key={m} type="button" onClick={() => {
                setPaymentMode(m)
                if (m === 'CASH' || m === 'UPI' || m === 'CHEQUE') setAmountPaid(totalAmount)
                if (m === 'CREDIT') setAmountPaid(0)
              }}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  paymentMode === m
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}>{m}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Amount paid now (₹)</label>
              <input type="number" value={amountPaid} min={0} max={totalAmount}
                onChange={e => setAmountPaid(Number(e.target.value))}
                className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col justify-end">
              <div className="text-xs text-stone-500">Remaining (udhar)</div>
              <div className={`text-base font-medium mt-1 ${totalDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {fmt(totalDue)}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-stone-500 mb-1">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any special instructions…"
              className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </Card>

        {error && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" disabled={createOrder.isPending}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {createOrder.isPending ? 'Saving…' : 'Save order & generate challan'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="px-5 py-2 border border-stone-200 dark:border-stone-700 text-sm rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  )
}
