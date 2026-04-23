'use client'
import { AppShell }  from '@/components/layout/AppShell'
import { Card }      from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useOrders, useDeleteOrder, useBulkDeleteOrders }  from '@/hooks/useOrders'
import { fmt, fmtDate } from '@/lib/utils'
import Link           from 'next/link'
import { useState }   from 'react'

const STATUSES = ['ALL','CONFIRMED','DISPATCHED','DELIVERED','CANCELLED']

export default function OrdersPage() {
  const [status, setStatus] = useState('ALL')
  const { data, isLoading } = useOrders({ status: status === 'ALL' ? undefined : status } as any)
  const deleteOrder = useDeleteOrder()
  const bulkDelete  = useBulkDeleteOrders()
  const orders = data?.items ?? []

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allSelected = orders.length > 0 && selected.size === orders.length

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orders.map((o: any) => o.id)))
    }
  }

  function handleDelete(id: string, orderNumber: string) {
    if (!confirm(`Delete ${orderNumber}? This will reverse stock and remove ledger entries.`)) return
    deleteOrder.mutate(id, { onSuccess: () => setSelected(prev => { const n = new Set(prev); n.delete(id); return n }) })
  }

  function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} selected order(s)? Stock will be reversed and ledger entries removed.`)) return
    bulkDelete.mutate([...selected], { onSuccess: () => setSelected(new Set()) })
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {STATUSES.map(s => (
            <button key={s} onClick={() => { setStatus(s); setSelected(new Set()) }}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                status === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50'
              }`}>
              {s}
            </button>
          ))}
        </div>
        <Link href="/orders/new"
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium">
          + New order
        </Link>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2">
          <span className="text-xs font-medium text-red-800 dark:text-red-200">
            {selected.size} order{selected.size > 1 ? 's' : ''} selected
          </span>
          <button onClick={handleBulkDelete} disabled={bulkDelete.isPending}
            className="text-xs px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 font-medium transition-colors">
            {bulkDelete.isPending ? 'Deleting…' : `Delete selected`}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 ml-auto">
            Clear selection
          </button>
        </div>
      )}

      <Card>
        {isLoading ? <PageLoader /> : orders.length === 0 ? (
          <EmptyState title="No orders found" sub="Create your first order to get started"
            action={<Link href="/orders/new" className="text-xs text-blue-600 hover:underline">Create order →</Link>} />
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="text-left py-2 pr-2 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                </th>
                {['Order #','Date','Customer','Items','Amount','Paid','Due','Status',''].map(h => (
                  <th key={h} className="text-left py-2 pr-3 font-normal text-stone-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => {
                const due = Number(o.totalAmount) - Number(o.amountPaid)
                const isSelected = selected.has(o.id)
                return (
                  <tr key={o.id} className={`border-b border-stone-50 dark:border-stone-800 last:border-0 transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-950/50' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  }`}>
                    <td className="py-2.5 pr-2">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleOne(o.id)}
                        className="rounded border-stone-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-stone-700 dark:text-stone-300">{o.orderNumber}</td>
                    <td className="py-2.5 pr-3 text-stone-500">{fmtDate(o.createdAt)}</td>
                    <td className="py-2.5 pr-3 font-medium text-stone-800 dark:text-stone-200">{o.customer?.name}</td>
                    <td className="py-2.5 pr-3 text-stone-500">{o.items?.length}</td>
                    <td className="py-2.5 pr-3 font-medium">{fmt(Number(o.totalAmount))}</td>
                    <td className="py-2.5 pr-3 text-green-700 dark:text-green-400">{fmt(Number(o.amountPaid))}</td>
                    <td className={`py-2.5 pr-3 font-medium ${due > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-400'}`}>
                      {due > 0 ? fmt(due) : '—'}
                    </td>
                    <td className="py-2.5 pr-3"><Badge variant={statusBadge(o.status)}>{o.status}</Badge></td>
                    <td className="py-2.5">
                      <div className="flex gap-2">
                        <Link href={`/orders/${o.id}`} className="text-blue-500 hover:underline">View</Link>
                        <button onClick={() => handleDelete(o.id, o.orderNumber)}
                          className="text-red-400 hover:text-red-600 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {data?.total > 0 && (
        <div className="text-xs text-stone-400 mt-3 text-right">{data.total} total orders</div>
      )}
    </AppShell>
  )
}
