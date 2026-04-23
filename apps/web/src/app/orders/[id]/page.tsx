'use client'
import { AppShell }   from '@/components/layout/AppShell'
import { Card }       from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import { useOrder }   from '@/hooks/useOrders'
import { useInventory } from '@/hooks/useInventory'
import { fmt, fmtDate } from '@/lib/utils'
import { useParams, useRouter } from 'next/navigation'
import { useState }   from 'react'
import { api }        from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import Link           from 'next/link'
import { useAuthStore } from '@/store/auth'

const STATUS_FLOW: Record<string, string[]> = {
  DRAFT:      ['CONFIRMED','CANCELLED'],
  CONFIRMED:  ['DISPATCHED','CANCELLED'],
  DISPATCHED: ['DELIVERED','CONFIRMED'],
  DELIVERED:  [],
  CANCELLED:  [],
}

export default function OrderDetailPage() {
  const { id }         = useParams<{ id: string }>()
  const router         = useRouter()
  const qc             = useQueryClient()
  const { data: order, isLoading } = useOrder(id)
  const [updating, setUpdating]    = useState(false)
  const [showChallan, setShowChallan] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [addingItem, setAddingItem]   = useState(false)
  const [newItem, setNewItem]         = useState({ materialId: '', quantity: 1, unitPrice: 0, purchasePrice: 0 })
  const { data: materials } = useInventory()
  const { user } = useAuthStore()

  async function updateStatus(status: string) {
    setUpdating(true)
    try {
      await api.patch(`/api/orders/${id}/status`, { status })
      qc.invalidateQueries({ queryKey: ['orders', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } finally { setUpdating(false) }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.materialId || newItem.quantity <= 0) return
    setAddingItem(true)
    try {
      await api.post(`/api/orders/${id}/items`, newItem)
      qc.invalidateQueries({ queryKey: ['orders', id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setShowAddItem(false)
      setNewItem({ materialId: '', quantity: 1, unitPrice: 0, purchasePrice: 0 })
    } finally { setAddingItem(false) }
  }

  if (isLoading) return <AppShell><PageLoader /></AppShell>
  if (!order)    return <AppShell><div className="text-sm text-stone-500">Order not found.</div></AppShell>

  const due          = Number(order.totalAmount) - Number(order.amountPaid)
  const nextStatuses = STATUS_FLOW[order.status] ?? []

  return (
    <AppShell>
      <div className="max-w-3xl space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-medium text-stone-900 dark:text-stone-100">{order.orderNumber}</h1>
              <Badge variant={statusBadge(order.status)}>{order.status}</Badge>
            </div>
            <div className="text-xs text-stone-500">
              {fmtDate(order.createdAt)}
              {order.deliveryDate && ` · Delivery: ${fmtDate(order.deliveryDate)}`}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {nextStatuses.map(s => (
              <button key={s} onClick={() => updateStatus(s)} disabled={updating}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50 ${
                  s === 'CANCELLED' ? 'border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}>
                {updating ? '…' : `Mark ${s.toLowerCase()}`}
              </button>
            ))}
            <button onClick={() => setShowChallan(true)}
              className="text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-md hover:bg-stone-50 dark:hover:bg-stone-800">
              View challan
            </button>
            <Link href="/orders"
              className="text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-md hover:bg-stone-50 dark:hover:bg-stone-800">
              ← Back
            </Link>
          </div>
        </div>

        {/* Customer + payment summary */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Customer</div>
            <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{order.customer?.name}</div>
            <div className="text-xs text-stone-500 mt-1">{order.customer?.phone}</div>
            {order.customer?.address && (
              <div className="text-xs text-stone-400 mt-0.5">{order.customer.address}</div>
            )}
            <Link href={`/khata?customer=${order.customer?.id}`}
              className="text-xs text-blue-500 hover:underline mt-2 block">
              View khata →
            </Link>
          </Card>

          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Payment</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Order total</span>
                <span className="font-medium">{fmt(Number(order.totalAmount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Paid</span>
                <span className="font-medium text-green-700 dark:text-green-400">{fmt(Number(order.amountPaid))}</span>
              </div>
              <div className="flex justify-between border-t border-stone-100 dark:border-stone-800 pt-2">
                <span className="text-stone-500">Outstanding</span>
                <span className={`font-medium ${due > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600'}`}>
                  {due > 0 ? fmt(due) : 'Cleared ✓'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-400">Mode</span>
                <span className="text-stone-600 dark:text-stone-400">{order.paymentMode}</span>
              </div>
              {order.marginPct && (
                <div className="flex justify-between text-xs">
                  <span className="text-stone-400">Margin</span>
                  <span className="text-stone-600 dark:text-stone-400">{Number(order.marginPct).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Order items */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Items ordered</div>
            {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
              <button onClick={() => setShowAddItem(true)}
                className="text-xs text-blue-600 hover:underline">+ Add item</button>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                {['Material','Quantity','Rate','Amount','Margin'].map(h => (
                  <th key={h} className="text-left py-2 pr-4 font-normal text-stone-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item: any) => {
                const margin = item.purchasePrice > 0
                  ? ((item.unitPrice - item.purchasePrice) / item.purchasePrice * 100).toFixed(1)
                  : null
                return (
                  <tr key={item.id} className="border-b border-stone-50 dark:border-stone-800 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-stone-800 dark:text-stone-200">
                      {item.material?.name}
                    </td>
                    <td className="py-2.5 pr-4 text-stone-600 dark:text-stone-400">
                      {Number(item.quantity).toFixed(2)} {item.material?.unit}
                    </td>
                    <td className="py-2.5 pr-4 text-stone-600 dark:text-stone-400">
                      {fmt(Number(item.unitPrice))}/{item.material?.unit}
                    </td>
                    <td className="py-2.5 pr-4 font-medium">{fmt(Number(item.lineTotal))}</td>
                    <td className="py-2.5 pr-4">
                      {margin ? (
                        <Badge variant={Number(margin) >= 10 ? 'success' : Number(margin) >= 5 ? 'warning' : 'danger'}>
                          {margin}%
                        </Badge>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-stone-50 dark:bg-stone-800/50">
                <td colSpan={3} className="py-2.5 pr-4 text-xs font-medium text-stone-600 dark:text-stone-400">
                  Total
                </td>
                <td className="py-2.5 pr-4 text-sm font-medium text-stone-900 dark:text-stone-100">
                  {fmt(Number(order.totalAmount))}
                </td>
                <td className="py-2.5 text-xs text-stone-500">
                  {order.marginPct ? `${Number(order.marginPct).toFixed(1)}% avg` : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>

        {/* Deliveries */}
        {order.deliveries?.length > 0 && (
          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">Deliveries</div>
            {order.deliveries.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-stone-50 dark:border-stone-800 last:border-0">
                <div>
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">{d.challanNumber}</div>
                  <div className="text-[10px] text-stone-400 mt-0.5">
                    {d.driverName && `${d.driverName} · `}{d.vehicleNumber}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {d.deliveredAt && (
                    <span className="text-[10px] text-stone-400">{fmtDate(d.deliveredAt)}</span>
                  )}
                  <Badge variant={statusBadge(d.status)}>{d.status}</Badge>
                </div>
              </div>
            ))}
          </Card>
        )}

        {order.notes && (
          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1">Notes</div>
            <div className="text-sm text-stone-700 dark:text-stone-300">{order.notes}</div>
          </Card>
        )}
      </div>

      {/* Challan modal (print view) */}
      {showChallan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowChallan(false)}>
          <div className="bg-white dark:bg-stone-900 rounded-xl p-6 max-w-lg w-full"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-medium text-stone-900 dark:text-stone-100">Delivery Challan</div>
                <div className="text-xs text-stone-500 mt-0.5">{user?.businessName}{user?.businessCity ? `, ${user.businessCity}` : ''}</div>
              </div>
              <button onClick={() => setShowChallan(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none">✕</button>
            </div>

            <div className="border border-stone-200 dark:border-stone-700 rounded-lg p-4 text-sm space-y-3">
              <div className="flex justify-between text-xs text-stone-500">
                <span>Order: {order.orderNumber}</span>
                <span>Date: {fmtDate(order.createdAt)}</span>
              </div>
              <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
                <div className="text-xs text-stone-500 mb-1">Deliver to:</div>
                <div className="font-medium">{order.customer?.name}</div>
                <div className="text-xs text-stone-500">{order.customer?.phone}</div>
                {order.customer?.address && (
                  <div className="text-xs text-stone-400">{order.customer.address}</div>
                )}
              </div>
              <table className="w-full text-xs border-t border-stone-100 dark:border-stone-800 pt-3">
                <thead>
                  <tr>
                    <th className="text-left py-1 font-normal text-stone-400">Material</th>
                    <th className="text-right py-1 font-normal text-stone-400">Qty</th>
                    <th className="text-right py-1 font-normal text-stone-400">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item: any) => (
                    <tr key={item.id} className="border-t border-stone-50 dark:border-stone-800">
                      <td className="py-1.5 font-medium text-stone-800 dark:text-stone-200">{item.material?.name}</td>
                      <td className="py-1.5 text-right">{Number(item.quantity).toFixed(2)}</td>
                      <td className="py-1.5 text-right text-stone-500">{item.material?.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-stone-200 dark:border-stone-700 pt-3 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-stone-400 mb-6">Driver signature:</div>
                  <div className="border-b border-stone-300 dark:border-stone-600" />
                </div>
                <div>
                  <div className="text-stone-400 mb-6">Customer signature:</div>
                  <div className="border-b border-stone-300 dark:border-stone-600" />
                </div>
              </div>
            </div>
            <button onClick={() => window.print()}
              className="mt-3 w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              Print challan
            </button>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddItem(false)}>
          <div className="bg-white dark:bg-stone-900 rounded-xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}>
            <div className="text-lg font-medium text-stone-900 dark:text-stone-100 mb-4">Add Item to Order</div>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Material</label>
                <select value={newItem.materialId} onChange={e => {
                  const mat = materials?.find((m: any) => m.id === e.target.value)
                  if (mat) {
                    setNewItem({ ...newItem, materialId: mat.id, unitPrice: Number(mat.salePrice), purchasePrice: Number(mat.purchasePrice) })
                  } else {
                    setNewItem({ ...newItem, materialId: '' })
                  }
                }}
                  className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required>
                  <option value="">Select material…</option>
                  {(materials ?? []).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.stockQty} {m.unit} in stock)</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Quantity</label>
                  <input type="number" min={0.01} step={0.01} value={newItem.quantity}
                    onChange={e => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                    className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Unit Price (₹)</label>
                  <input type="number" min={0} step={0.01} value={newItem.unitPrice}
                    onChange={e => setNewItem({ ...newItem, unitPrice: Number(e.target.value) })}
                    className="w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={addingItem}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {addingItem ? 'Adding…' : 'Add Item'}
                </button>
                <button type="button" onClick={() => setShowAddItem(false)}
                  className="flex-1 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 py-2 rounded-lg text-sm hover:bg-stone-50 dark:hover:bg-stone-800">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  )
}
