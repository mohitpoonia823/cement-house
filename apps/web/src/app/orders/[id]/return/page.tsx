'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Card, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { fmt } from '@/lib/utils'
import { useOrder, useCreateSalesReturn } from '@/hooks/useOrders'

export default function OrderReturnPage() {
  const params = useParams<{ id: string }>()
  const orderId = String(params?.id ?? '')
  const router = useRouter()
  const { data: order, isLoading } = useOrder(orderId)
  const createReturn = useCreateSalesReturn()
  const [reason, setReason] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const rows = (order?.items ?? []) as Array<any>
  const preview = useMemo(() => {
    let total = 0
    for (const item of rows) {
      const qty = Number(quantities[item.id] ?? 0)
      if (!(qty > 0)) continue
      const soldQty = Number(item.quantity ?? 0)
      if (soldQty <= 0) continue
      const ratio = qty / soldQty
      const lineTotal = Number(item.lineTotal ?? (soldQty * Number(item.unitPrice ?? 0)))
      total += lineTotal * ratio
    }
    return Math.max(0, Number(total.toFixed(2)))
  }, [rows, quantities])

  if (isLoading) return <AppShell><PageLoader /></AppShell>
  if (!order) return <AppShell><Card>Order not found.</Card></AppShell>

  async function submit() {
    setError('')
    const items = rows
      .map((item) => ({ orderItemId: item.id, quantityReturned: Number(quantities[item.id] ?? 0) }))
      .filter((item) => item.quantityReturned > 0)

    if (items.length === 0) {
      setError('Select at least one item quantity to return')
      return
    }

    try {
      await createReturn.mutateAsync({
        orderId,
        reason: reason || undefined,
        items,
      })
      router.push(`/orders/${orderId}`)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create return')
    }
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Sales return"
        title={`Return for ${order.orderNumber}`}
        description="Select delivered items and quantities. Stock, ledger, and GST adjustments are applied automatically."
        action={<Link href={`/orders/${orderId}`} className="text-xs text-blue-600 hover:underline">Back to order</Link>}
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-stone-500">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              placeholder="Damaged bag, quality issue, wrong dispatch..."
            />
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
            <div>Preview refund/adjustment: <span className="font-semibold">{fmt(preview)}</span></div>
            <div className="mt-1 text-stone-500">Final GST reversal is computed server-side proportionally.</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3 text-left">Item</th>
                <th className="py-2 pr-3 text-left">Sold Qty</th>
                <th className="py-2 pr-3 text-left">Unit Price</th>
                <th className="py-2 pr-3 text-left">Return Qty</th>
                <th className="py-2 pr-3 text-left">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const soldQty = Number(item.quantity ?? 0)
                return (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3">{item.material?.name ?? item.materialId}</td>
                    <td className="py-2 pr-3">{soldQty} {item.material?.unit ?? ''}</td>
                    <td className="py-2 pr-3">{fmt(Number(item.unitPrice ?? 0))}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        max={soldQty}
                        step={0.001}
                        value={quantities[item.id] ?? ''}
                        onChange={(e) => setQuantities((p) => ({ ...p, [item.id]: e.target.value }))}
                        className="w-28 rounded-lg border border-stone-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-2 pr-3">{fmt(Number(item.lineTotal ?? soldQty * Number(item.unitPrice ?? 0)))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error ? <div className="mt-3 text-xs text-red-600">{error}</div> : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={createReturn.isPending}
            className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950"
          >
            {createReturn.isPending ? 'Creating return...' : 'Create return'}
          </button>
          <Link href={`/orders/${orderId}`} className="rounded-lg border border-stone-200 px-4 py-2 text-xs hover:bg-stone-50 dark:border-slate-700 dark:hover:bg-slate-800">
            Cancel
          </Link>
        </div>
      </Card>
    </AppShell>
  )
}
