'use client'
import { AppShell }   from '@/components/layout/AppShell'
import { Card }       from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTodayDeliveries, useConfirmDelivery } from '@/hooks/useDelivery'
import { fmt, fmtDate } from '@/lib/utils'
import { useState }   from 'react'

export default function DeliveryPage() {
  const { data, isLoading } = useTodayDeliveries()
  const confirmDelivery     = useConfirmDelivery()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [otpRef,     setOtpRef]     = useState('')

  const deliveries: any[] = data?.list ?? []

  async function handleConfirm(id: string) {
    await confirmDelivery.mutateAsync({ id, confirmationType: 'OTP', confirmationRef: otpRef || 'MANUAL' })
    setConfirming(null); setOtpRef('')
  }

  return (
    <AppShell>
      {/* Summary bar */}
      {data && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total today',  value: data.total,     color: '' },
            { label: 'Scheduled',   value: data.scheduled, color: 'text-blue-600' },
            { label: 'In transit',  value: data.inTransit, color: 'text-amber-600' },
            { label: 'Delivered',   value: data.delivered, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-stone-100 dark:bg-stone-800 rounded-lg p-3">
              <div className="text-xs text-stone-500 mb-1">{s.label}</div>
              <div className={`text-2xl font-medium ${s.color || 'text-stone-900 dark:text-stone-100'}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
          Today's delivery board
        </div>
        {isLoading ? <PageLoader /> : deliveries.length === 0 ? (
          <EmptyState title="No deliveries today" sub="Deliveries are created when an order is dispatched" />
        ) : (
          <div className="space-y-3">
            {deliveries.map((d: any) => (
              <div key={d.id}
                className={`border rounded-xl p-3 transition-colors ${
                  d.status === 'DELIVERED' ? 'border-green-200 bg-green-50/50 dark:bg-green-950/30 dark:border-green-800'
                  : d.status === 'IN_TRANSIT' ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/30 dark:border-amber-800'
                  : d.status === 'FAILED'    ? 'border-red-200 bg-red-50/50 dark:bg-red-950/30 dark:border-red-800'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-stone-600 dark:text-stone-400">{d.challanNumber}</span>
                      <Badge variant={statusBadge(d.status)}>{d.status}</Badge>
                    </div>
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200">{d.order?.customer?.name}</div>
                    <div className="text-xs text-stone-500 mt-0.5">{d.order?.customer?.address}</div>
                    <div className="text-xs text-stone-400 mt-1">
                      {d.driverName && `Driver: ${d.driverName}`}
                      {d.vehicleNumber && ` · ${d.vehicleNumber}`}
                    </div>
                    {/* Items */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(d.items ?? []).map((item: any) => (
                        <span key={item.id} className="text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 px-2 py-0.5 rounded">
                          {item.material?.name}: {Number(item.deliveredQty)} {item.material?.unit}
                          {Number(item.deliveredQty) !== Number(item.orderedQty) && (
                            <span className="text-red-500"> (ordered {Number(item.orderedQty)})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="ml-3 flex flex-col gap-1 items-end flex-shrink-0">
                    {d.status === 'DELIVERED' && (
                      <div className="text-[10px] text-green-700 dark:text-green-400">
                        Confirmed · {d.confirmationRef}
                      </div>
                    )}
                    {(d.status === 'SCHEDULED' || d.status === 'IN_TRANSIT') && (
                      <>
                        {confirming === d.id ? (
                          <div className="flex gap-1 items-center">
                            <input value={otpRef} onChange={e => setOtpRef(e.target.value)}
                              placeholder="OTP / ref"
                              className="text-xs px-2 py-1 border border-stone-200 rounded w-24 focus:outline-none focus:ring-1 focus:ring-green-500 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-700" />
                            <button onClick={() => handleConfirm(d.id)} disabled={confirmDelivery.isPending}
                              className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                              Confirm
                            </button>
                            <button onClick={() => setConfirming(null)} className="text-xs text-stone-400 hover:text-stone-600">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirming(d.id)}
                            className="text-xs px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700">
                            Mark delivered
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  )
}
