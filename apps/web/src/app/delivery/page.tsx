'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTodayDeliveries, useConfirmDelivery } from '@/hooks/useDelivery'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'

export default function DeliveryPage() {
  const { language } = useI18n()
  const { data, isLoading } = useTodayDeliveries()
  const confirmDelivery = useConfirmDelivery()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [otpRef, setOtpRef] = useState('')

  const deliveries: any[] = data?.list ?? []

  async function handleConfirm(id: string) {
    await confirmDelivery.mutateAsync({ id, confirmationType: 'OTP', confirmationRef: otpRef || 'MANUAL' })
    setConfirming(null)
    setOtpRef('')
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow={language === 'hi' ? 'फुलफिलमेंट एनालिटिक्स' : 'Fulfilment analytics'}
        title={language === 'hi' ? 'डिलीवरी बोर्ड' : 'Delivery board'}
        description={language === 'hi' ? 'आज के डिस्पैच को ट्रैक करें, जल्दी कन्फर्म करें, और चालान विज़िबिलिटी बनाए रखें।' : language === 'hinglish' ? 'Aaj ka dispatch track karo, jaldi confirm karo aur challan visibility clear rakho.' : 'Watch today’s dispatch pipeline, confirm arrivals fast, and keep challan visibility front and center.'}
      />

      {data && (
        <MetricGrid className="mb-6">
          <MetricCard label={language === 'hi' ? 'आज कुल' : 'Total today'} value={String(data.total)} hint={language === 'hi' ? 'सभी एक्टिव डिलीवरी रिकॉर्ड' : 'All active delivery records'} />
          <MetricCard label={language === 'hi' ? 'शेड्यूल्ड' : 'Scheduled'} value={String(data.scheduled)} hint={language === 'hi' ? 'वाहन मूवमेंट बाकी' : 'Awaiting vehicle movement'} tone="info" />
          <MetricCard label={language === 'hi' ? 'रास्ते में' : 'In transit'} value={String(data.inTransit)} hint={language === 'hi' ? 'चल रही ट्रिप्स' : 'Trips currently underway'} tone="warning" />
          <MetricCard label={language === 'hi' ? 'डिलीवर' : 'Delivered'} value={String(data.delivered)} hint={language === 'hi' ? 'आज पूरी हुई कन्फर्मेशन' : 'Completed confirmations today'} tone="success" />
        </MetricGrid>
      )}

      <Card>
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
          {language === 'hi' ? 'आज का डिलीवरी बोर्ड' : "Today's delivery board"}
        </div>
        {isLoading ? (
          <PageLoader />
        ) : deliveries.length === 0 ? (
          <EmptyState title={language === 'hi' ? 'आज कोई डिलीवरी नहीं' : 'No deliveries today'} sub={language === 'hi' ? 'डिलीवरी ऑर्डर डिस्पैच होने पर बनती है' : 'Deliveries are created when an order is dispatched'} />
        ) : (
          <div className="space-y-3">
            {deliveries.map((d: any) => (
              <div
                key={d.id}
                className={`rounded-xl border p-3 transition-colors ${
                  d.status === 'DELIVERED'
                    ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30'
                    : d.status === 'IN_TRANSIT'
                      ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30'
                      : d.status === 'FAILED'
                        ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30'
                        : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-medium text-stone-600 dark:text-stone-400">{d.challanNumber}</span>
                      <Badge variant={statusBadge(d.status)}>{d.status}</Badge>
                    </div>
                    <div className="text-sm font-medium text-stone-800 dark:text-stone-200">{d.order?.customer?.name}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{d.order?.customer?.address}</div>
                    <div className="mt-1 text-xs text-stone-400">
                      {d.driverName && `${language === 'hi' ? 'ड्राइवर' : 'Driver'}: ${d.driverName}`}
                      {d.vehicleNumber && ` • ${d.vehicleNumber}`}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(d.items ?? []).map((item: any) => (
                        <span key={item.id} className="rounded bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                          {item.material?.name}: {Number(item.deliveredQty)} {item.material?.unit}
                          {Number(item.deliveredQty) !== Number(item.orderedQty) && (
                            <span className="text-red-500"> ({language === 'hi' ? 'ऑर्डर' : 'ordered'} {Number(item.orderedQty)})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="ml-3 flex flex-shrink-0 flex-col items-end gap-1">
                    {d.status === 'DELIVERED' && <div className="text-[10px] text-green-700 dark:text-green-400">{language === 'hi' ? 'कन्फर्म' : 'Confirmed'} • {d.confirmationRef}</div>}
                    {(d.status === 'SCHEDULED' || d.status === 'IN_TRANSIT') &&
                      (confirming === d.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={otpRef}
                            onChange={(e) => setOtpRef(e.target.value)}
                            placeholder={language === 'hi' ? 'OTP / रेफ' : 'OTP / ref'}
                            className="w-24 rounded border border-stone-200 px-2 py-1 text-xs focus:ring-1 focus:ring-green-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                          />
                          <button
                            onClick={() => handleConfirm(d.id)}
                            disabled={confirmDelivery.isPending}
                            className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {language === 'hi' ? 'कन्फर्म' : 'Confirm'}
                          </button>
                          <button onClick={() => setConfirming(null)} className="text-xs text-stone-400 hover:text-stone-600">
                            ×
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirming(d.id)} className="rounded-md bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">
                          {language === 'hi' ? 'डिलीवर मार्क करें' : language === 'hinglish' ? 'Delivered mark karo' : 'Mark delivered'}
                        </button>
                      ))}
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

