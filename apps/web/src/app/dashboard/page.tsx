'use client'

import { startTransition, useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AppShell } from '@/components/layout/AppShell'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useCustomers, useSendReminders } from '@/hooks/useCustomers'
import { useDashboard } from '@/hooks/useDashboard'
import { cn, fmt, fmtDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'
import { businessTerms } from '@/lib/business-terms'

const RevenueRhythmChart = dynamic(
  () => import('@/components/dashboard/DashboardCharts').then((mod) => mod.RevenueRhythmChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
)
const DonutBreakdown = dynamic(
  () => import('@/components/dashboard/DashboardCharts').then((mod) => mod.DonutBreakdown),
  {
    ssr: false,
    loading: () => <MiniChartSkeleton />,
  }
)

const RANGE_OPTIONS = [
  { value: '7d', label: '7D' },
  { value: '1m', label: '1M' },
  { value: '2m', label: '2M' },
  { value: '1y', label: '1Y' },
  { value: 'custom', label: 'Custom' },
] as const

const LIST_LIMIT_OPTIONS = [5, 10, 50] as const

type RangePreset = (typeof RANGE_OPTIONS)[number]['value']

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function percentageLabel(value: number | undefined, compareLabel: string, tr: (en: string, hi: string, hinglish?: string) => string) {
  const safeValue = Number(value ?? 0)
  if (safeValue === 0) return `${tr('Flat vs', 'स्थिर बनाम', 'Flat vs')} ${compareLabel.toLowerCase()}`
  return `${safeValue > 0 ? '+' : ''}${safeValue.toFixed(1)}% vs ${compareLabel.toLowerCase()}`
}

function granularityLabel(granularity: string | undefined, tr: (en: string, hi: string, hinglish?: string) => string) {
  if (granularity === 'month') return tr('Monthly view', 'मंथली व्यू', 'Monthly view')
  if (granularity === 'week') return tr('Weekly view', 'वीकली व्यू', 'Weekly view')
  return tr('Daily view', 'डेली व्यू', 'Daily view')
}

function emptyIfBlank(value: string | null) {
  return value?.trim() ?? ''
}

function DashboardContent() {
  const { language } = useI18n()
  const tr = (en: string, hi: string, hinglish?: string) =>
    language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rangeParam = searchParams.get('range')
  const activeRange: RangePreset = RANGE_OPTIONS.some((option) => option.value === rangeParam)
    ? (rangeParam as RangePreset)
    : '7d'

  const startDateParam = emptyIfBlank(searchParams.get('startDate'))
  const endDateParam = emptyIfBlank(searchParams.get('endDate'))
  const fallbackCustomStart = formatDateInput(addDays(new Date(), -29))
  const fallbackCustomEnd = formatDateInput(new Date())

  const [customStartDate, setCustomStartDate] = useState(startDateParam || fallbackCustomStart)
  const [customEndDate, setCustomEndDate] = useState(endDateParam || fallbackCustomEnd)
  const [recentOrdersLimit, setRecentOrdersLimit] = useState<number>(5)
  const [topCustomersLimit, setTopCustomersLimit] = useState<number>(5)
  const [stockAlertsLimit, setStockAlertsLimit] = useState<number>(5)

  useEffect(() => {
    setCustomStartDate(startDateParam || fallbackCustomStart)
    setCustomEndDate(endDateParam || fallbackCustomEnd)
  }, [endDateParam, fallbackCustomEnd, fallbackCustomStart, startDateParam])

  const dashboardQuery =
    activeRange === 'custom'
      ? {
          range: activeRange,
          startDate: startDateParam || customStartDate || fallbackCustomStart,
          endDate: endDateParam || customEndDate || fallbackCustomEnd,
          recentOrdersLimit,
          topCustomersLimit,
          stockAlertsLimit,
        }
      : { range: activeRange, recentOrdersLimit, topCustomersLimit, stockAlertsLimit }

  const { data, isLoading } = useDashboard(dashboardQuery)
  const { user } = useAuthStore()
  const terms = businessTerms(user?.businessType as any, user?.customLabels as any)
  const { data: customers } = useCustomers(undefined, { enabled: user?.role === 'OWNER' })
  const sendReminders = useSendReminders()

  const overdueCustomers = (customers ?? []).filter((customer: any) => Number(customer.balance) > 0)
  const compareLabel = data?.range?.comparisonLabel ?? tr('previous period', 'पिछली अवधि', 'previous period')
  const selectedLabel = data?.range?.label ?? tr('Last 7 days', 'पिछले 7 दिन', 'Last 7 days')
  const customRangeInvalid = customStartDate > customEndDate

  function updateDashboardQuery(nextRange: RangePreset, nextStartDate?: string, nextEndDate?: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', nextRange)

    if (nextRange === 'custom') {
      params.set('startDate', nextStartDate ?? customStartDate ?? fallbackCustomStart)
      params.set('endDate', nextEndDate ?? customEndDate ?? fallbackCustomEnd)
    } else {
      params.delete('startDate')
      params.delete('endDate')
    }

    const queryString = params.toString()
    startTransition(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
    })
  }

  function handleRangeSelect(nextRange: RangePreset) {
    if (nextRange === 'custom') {
      const nextStart = customStartDate || data?.range?.startDate || fallbackCustomStart
      const nextEnd = customEndDate || data?.range?.endDate || fallbackCustomEnd
      setCustomStartDate(nextStart)
      setCustomEndDate(nextEnd)
      updateDashboardQuery('custom', nextStart, nextEnd)
      return
    }

    updateDashboardQuery(nextRange)
  }

  function handleApplyCustomRange() {
    if (customRangeInvalid) return
    updateDashboardQuery('custom', customStartDate, customEndDate)
  }

  async function handleSendReminders() {
    if (!overdueCustomers.length) {
      window.alert(tr('No customers with outstanding balance found.', 'बकाया बैलेंस वाले ग्राहक नहीं मिले।', 'Outstanding balance wale customers nahi mile.'))
      return
    }

    const confirmed = window.confirm(
      tr(
        `Send WhatsApp reminders to ${overdueCustomers.length} customer(s) with outstanding balance?`,
        `क्या ${overdueCustomers.length} बकाया ग्राहकों को WhatsApp रिमाइंडर भेजना है?`,
        `Kya ${overdueCustomers.length} outstanding customers ko WhatsApp reminder bhejna hai?`
      )
    )
    if (!confirmed) return

    try {
      const result = await sendReminders.mutateAsync(overdueCustomers.map((customer: any) => customer.id))
      window.alert(
        tr(
          `Sent ${result.data.sent} reminder(s).`,
          `${result.data.sent} रिमाइंडर भेज दिए गए।`,
          `${result.data.sent} reminders bhej diye gaye.`
        )
      )
    } catch (error: any) {
      window.alert(error?.response?.data?.error ?? tr('Failed to send reminders.', 'रिमाइंडर भेजने में समस्या हुई।', 'Reminders bhejne me problem hui.'))
    }
  }

  if (isLoading && !data) {
    return (
      <AppShell>
        <PageLoader />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow={tr('Business pulse', 'बिज़नेस पल्स', 'Business pulse')}
        title={tr('Analytics-first command center', 'एनालिटिक्स कमांड सेंटर', 'Analytics-first command center')}
        description={tr('Switch between 7-day, monthly, 2-month, yearly, or custom windows without leaving the dashboard.', 'डैशबोर्ड छोड़े बिना 7-दिन, मंथली, 2-महीने, ईयरली या कस्टम विंडो के बीच स्विच करें।', 'Dashboard chhode bina 7-day, monthly, 2-month, yearly ya custom windows switch karo.')}
        action={
          <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
            <div className="flex flex-wrap gap-2 md:justify-end">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleRangeSelect(option.value)}
                  className={cn(
                    'rounded-full border px-3 py-2 text-xs font-semibold transition-colors',
                    activeRange === option.value
                      ? 'border-slate-950 bg-slate-950 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950'
                      : 'border-slate-200 bg-white/85 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-slate-900'
                  )}
                >
                  {option.value === 'custom' ? tr('Custom', 'कस्टम', 'Custom') : option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
              />
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{tr('to', 'से', 'to')}</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100"
              />
              <button
                onClick={handleApplyCustomRange}
                disabled={!customStartDate || !customEndDate || customRangeInvalid}
                className="rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
              >
                {tr('Apply range', 'रेंज लागू करें', 'Range apply karo')}
              </button>
            </div>

            {customRangeInvalid ? (
              <div className="text-right text-xs font-medium text-rose-600 dark:text-rose-300">
                {tr('End date must be on or after start date.', 'एंड डेट, स्टार्ट डेट के बाद या बराबर होनी चाहिए।', 'End date start date ke baad ya barabar honi chahiye.')}
              </div>
            ) : null}
          </div>
        }
      />

      <Card className="mb-6">
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr_0.8fr_0.8fr]">
          <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/55">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr('Current window', 'वर्तमान विंडो', 'Current window')}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{selectedLabel}</div>
              <Badge variant="info">{granularityLabel(data?.range?.granularity, tr)}</Badge>
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {tr('Comparing against', 'तुलना', 'Comparing')} {compareLabel.toLowerCase()} {tr('with live inventory and delivery context retained below.', 'के साथ, नीचे लाइव इन्वेंट्री और डिलीवरी संदर्भ दिख रहा है।', 'ke saath, neeche live inventory aur delivery context dikh raha hai.')}
            </div>
          </div>

          <InsightTile
            label={tr('Peak sales', 'पीक सेल्स', 'Peak sales')}
            value={data?.highlights?.strongestBucketSales ? fmt(data.highlights.strongestBucketSales) : fmt(0)}
            hint={data?.highlights?.strongestBucketLabel ?? tr('No standout period yet', 'अभी कोई प्रमुख अवधि नहीं', 'Abhi koi standout period nahi')}
          />
          <InsightTile
            label={tr('Average pace', 'औसत गति', 'Average pace')}
            value={fmt(data?.highlights?.averagePerBucket ?? 0)}
            hint={granularityLabel(data?.range?.granularity, tr)}
          />
          <InsightTile
            label={tr('Today so far', 'आज अब तक', 'Today so far')}
            value={fmt(data?.todaySnapshot?.sales ?? 0)}
            hint={`${data?.todaySnapshot?.orderCount ?? 0} ${tr('orders', 'ऑर्डर', 'orders')} | ${fmt(data?.todaySnapshot?.collected ?? 0)} ${tr('collected', 'कलेक्टेड', 'collected')}`}
          />
        </div>
      </Card>

      <MetricGrid className="mb-6">
        <MetricCard
          label={tr('Sales in range', 'रेंज में सेल्स', 'Sales in range')}
          value={fmt(data?.summary?.totalSales ?? 0)}
          hint={`${data?.summary?.orderCount ?? 0} ${tr('orders booked', 'ऑर्डर बुक हुए', 'orders booked')} | ${percentageLabel(data?.comparison?.salesDeltaPct, compareLabel, tr)}`}
          tone="brand"
        />
        <MetricCard
          label={tr('Cash collected', 'कलेक्टेड कैश', 'Cash collected')}
          value={fmt(data?.summary?.cashCollected ?? 0)}
          hint={`${data?.summary?.collectionRate ?? 0}% ${tr('collection rate', 'कलेक्शन रेट', 'collection rate')} | ${percentageLabel(data?.comparison?.collectedDeltaPct, compareLabel, tr)}`}
          tone="success"
        />
        <MetricCard
          label={tr('Outstanding in range', 'रेंज में बकाया', 'Outstanding in range')}
          value={fmt(data?.summary?.totalOutstanding ?? 0)}
          hint={`${data?.summary?.activeCustomersInRange ?? 0} ${tr('customers billed', 'ग्राहकों का बिल बना', 'customers billed')} | ${percentageLabel(data?.comparison?.outstandingDeltaPct, compareLabel, tr)}`}
          tone={(data?.summary?.totalOutstanding ?? 0) > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label={tr('Inventory pressure', 'इन्वेंट्री प्रेशर', 'Inventory pressure')}
          value={String(data?.summary?.lowStockCount ?? 0)}
          hint={`${data?.summary?.activeMaterials ?? 0} ${tr('active SKUs', 'सक्रिय SKU', 'active SKUs')} | ${tr('Today', 'आज', 'Today')} ${data?.todaySnapshot?.orderCount ?? 0} ${tr('orders', 'ऑर्डर', 'orders')}`}
          tone={(data?.summary?.lowStockCount ?? 0) > 0 ? 'danger' : 'default'}
        />
      </MetricGrid>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr('Revenue rhythm', 'रेवेन्यू रिदम', 'Revenue rhythm')}</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {tr('Sales vs collections in', 'सेल्स बनाम कलेक्शन', 'Sales vs collections in')} {selectedLabel.toLowerCase()}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <LegendDot color="#0ea5e9" label={tr('Sales', 'सेल्स', 'Sales')} />
                <LegendDot color="#10b981" label={tr('Collections', 'कलेक्शन', 'Collections')} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="info">{granularityLabel(data?.range?.granularity, tr)}</Badge>
              <Badge>{tr('Auto refresh', 'ऑटो रिफ्रेश', 'Auto refresh')}</Badge>
            </div>
          </div>
          <div className="h-80">
            <RevenueRhythmChart data={data?.revenueSeries ?? []} selectedLabel={selectedLabel} />
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr('Fulfilment', 'फुलफिलमेंट', 'Fulfilment')}</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{tr('Delivery workload', 'डिलीवरी वर्कलोड', 'Delivery workload')}</div>
            </div>
            <Badge>{tr('Live snapshot', 'लाइव स्नैपशॉट', 'Live snapshot')}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusTile label={tr('Total', 'कुल', 'Total')} value={data?.deliverySnapshot?.total ?? 0} tone="default" />
            <StatusTile label={tr('Scheduled', 'शेड्यूल्ड', 'Scheduled')} value={data?.deliverySnapshot?.SCHEDULED ?? 0} tone="info" />
            <StatusTile label={tr('In transit', 'ट्रांजिट में', 'In transit')} value={data?.deliverySnapshot?.IN_TRANSIT ?? 0} tone="warning" />
            <StatusTile label={tr('Delivered', 'डिलीवर हुआ', 'Delivered')} value={data?.deliverySnapshot?.DELIVERED ?? 0} tone="success" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <DonutBreakdown title={tr('Order mix in range', 'रेंज में ऑर्डर मिक्स', 'Order mix in range')} data={data?.orderStatus ?? []} />
            <DonutBreakdown title={tr('Customer risk mix', 'ग्राहक रिस्क मिक्स', 'Customer risk mix')} data={data?.riskSegments ?? []} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.85fr]">
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr('Recent flow', 'हाल की गतिविधि', 'Recent flow')}</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{tr('Latest orders in selection', 'चयन में नवीनतम ऑर्डर', 'Latest orders in selection')}</div>
            </div>
            <div className="shrink-0 pt-0.5">
              <SectionLimitSelect
                value={recentOrdersLimit}
                onChange={setRecentOrdersLimit}
              />
            </div>
          </div>
          {(data?.recentOrders ?? []).length > 0 ? (
            <div className="space-y-3">
              {(data?.recentOrders ?? []).map((order: any) => (
                <div key={order.id} className="rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">{order.orderNumber}</div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{order.customerName}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.itemSummary || tr('Mixed material order', 'मिक्स मैटेरियल ऑर्डर', 'Mixed material order')}</div>
                    </div>
                    <Badge variant={statusBadge(order.status)}>{order.status}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-950 dark:text-white">{fmt(order.totalAmount)}</span>
                    <span className="text-slate-500 dark:text-slate-400">{fmtDate(order.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDashboardState
              title={tr('No orders in the selected range', 'चयनित रेंज में कोई ऑर्डर नहीं', 'Selected range me koi order nahi')}
              description={tr('Try widening the date window or use the custom filter to inspect a different time period.', 'डेट विंडो बढ़ाएं या अलग समय देखने के लिए कस्टम फिल्टर उपयोग करें।', 'Date window badhao ya custom filter use karke alag time period dekho.')}
            />
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr(`${terms.customer} concentration`, 'ग्राहक संकेंद्रण', `${terms.customer} concentration`)}</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{tr(`Top revenue ${terms.customer.toLowerCase()}`, 'टॉप रेवेन्यू अकाउंट्स', `Top revenue ${terms.customer.toLowerCase()}`)}</div>
            </div>
            <div className="shrink-0 pt-0.5">
              <SectionLimitSelect
                value={topCustomersLimit}
                onChange={setTopCustomersLimit}
              />
            </div>
          </div>
          {(data?.topCustomers ?? []).length > 0 ? (
            <div className="space-y-3">
              {(data?.topCustomers ?? []).map((customer: any, index: number) => (
                <div key={customer.customerId} className="rounded-[22px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">
                        {index + 1}. {customer.customerName}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {customer.orderCount} {tr('orders', 'ऑर्डर', 'orders')} | {tr('Outstanding', 'बकाया', 'Outstanding')} {fmt(customer.outstanding)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">{fmt(customer.totalSales)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDashboardState
              title={tr(`No ${terms.customer.toLowerCase()} billing in this range`, 'इस रेंज में ग्राहक बिलिंग नहीं', `Is range me ${terms.customer.toLowerCase()} billing nahi`)}
              description={tr(`Top ${terms.customer.toLowerCase()} will appear here once orders are present in the selected period.`, 'चयनित अवधि में ऑर्डर आते ही टॉप अकाउंट्स यहां दिखेंगे।', `Selected period me orders aate hi top ${terms.customer.toLowerCase()} yahan dikhenge.`)}
            />
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr(`${terms.inventory} watch`, 'इन्वेंट्री वॉच', `${terms.inventory} watch`)}</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{tr(`${terms.material}s needing attention`, 'ध्यान देने योग्य आइटम', `${terms.material}s needing attention`)}</div>
            </div>
            <div className="shrink-0 pt-0.5">
              <SectionLimitSelect
                value={stockAlertsLimit}
                onChange={setStockAlertsLimit}
              />
            </div>
          </div>
          <div className="space-y-3">
            {(data?.stockAlerts ?? []).length > 0 ? (
              (data?.stockAlerts ?? []).map((material: any) => (
                <div key={material.id} className="rounded-[22px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">{material.name}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {tr('Threshold', 'न्यूनतम सीमा', 'Threshold')} {material.minThreshold} {material.unit}
                      </div>
                    </div>
                    <Badge variant={statusBadge(material.status)}>{material.status}</Badge>
                  </div>
                  <div className="mt-4 text-sm font-semibold text-slate-950 dark:text-white">
                    {material.stockQty} {material.unit}
                  </div>
                </div>
              ))
            ) : (
              <EmptyDashboardState
                title={tr(`All tracked ${terms.material.toLowerCase()}s are healthy`, 'सभी ट्रैक किए गए आइटम स्वस्थ हैं', `All tracked ${terms.material.toLowerCase()}s are healthy`)}
                description={tr(`No low-${terms.inventory.toLowerCase()} or out-of-${terms.inventory.toLowerCase()} ${terms.material.toLowerCase()}s need action right now.`, 'अभी किसी लो-स्टॉक या आउट-ऑफ-स्टॉक मैटेरियल पर कार्रवाई की जरूरत नहीं है।', `Abhi kisi low-${terms.inventory.toLowerCase()} ya out-of-${terms.inventory.toLowerCase()} ${terms.material.toLowerCase()} par action ki zarurat nahi hai.`)}
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr('Quick actions', 'त्वरित क्रियाएं', 'Quick actions')}</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{tr('Move faster', 'तेजी से काम करें', 'Move faster')}</div>
          </div>
          <div className="space-y-3">
            <ActionLink title={tr('New order', 'नया ऑर्डर', 'Naya order')} sub={tr('Create and dispatch a sales order', 'सेल्स ऑर्डर बनाएं और डिस्पैच करें', 'Sales order banao aur dispatch karo')} href="/orders/new" />
            <ActionLink title={tr('Record payment', 'भुगतान दर्ज करें', 'Payment record karo')} sub={tr('Update khata and clear balances', 'खाता अपडेट करें और बकाया साफ करें', 'Khata update karo aur balances clear karo')} href="/khata" />
            <ActionLink title={tr('Stock purchase', 'स्टॉक खरीद', 'Stock purchase')} sub={tr('Add inventory or replenish fast movers', 'इन्वेंट्री जोड़ें या फास्ट मूवर्स रीफिल करें', 'Inventory add karo ya fast movers replenish karo')} href="/inventory" />
            <ActionLink title={tr('Create delivery', 'डिलीवरी बनाएं', 'Delivery create karo')} sub={tr('Manage challan and delivery status', 'चालान और डिलीवरी स्टेटस मैनेज करें', 'Challan aur delivery status manage karo')} href="/delivery" />
            {user?.role === 'OWNER' ? (
              <button
                onClick={handleSendReminders}
                disabled={sendReminders.isPending}
                className="w-full rounded-[22px] border border-slate-200/70 bg-white/70 px-4 py-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">
                      {sendReminders.isPending ? tr('Sending reminders...', 'रिमाइंडर भेजे जा रहे हैं...', 'Reminders bheje ja rahe hain...') : tr('Send reminders', 'रिमाइंडर भेजें', 'Reminders bhejo')}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {tr('Trigger WhatsApp reminders for', 'WhatsApp रिमाइंडर भेजें', 'WhatsApp reminders bhejo')} {overdueCustomers.length} {tr(overdueCustomers.length === 1 ? 'customer' : 'customers', overdueCustomers.length === 1 ? 'ग्राहक' : 'ग्राहकों', overdueCustomers.length === 1 ? 'customer' : 'customers')} {tr('with dues', 'जिनका बकाया है', 'jinpar due hai')}
                    </div>
                  </div>
                  <Badge variant="warning">Live</Badge>
                </div>
              </button>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200/80 px-4 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {tr('Reminder sending is available for owner accounts.', 'रिमाइंडर भेजना केवल ओनर अकाउंट के लिए उपलब्ध है।', 'Reminder sending sirf owner accounts ke liye available hai.')}
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

function InsightTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200/70 bg-white/75 p-5 dark:border-slate-800 dark:bg-slate-950/55">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  )
}

function SectionLimitSelect({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
      <div className="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-white/85 dark:border-slate-700 dark:bg-slate-950/60">
        {LIST_LIMIT_OPTIONS.map((option, index) => {
          const active = value === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                active
                  ? 'bg-slate-900 text-white dark:bg-sky-400 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              } ${index > 0 ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EmptyDashboardState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-200/80 px-4 py-8 text-center dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-950 dark:text-white">{title}</div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{description}</div>
    </div>
  )
}

function ActionLink({ title, sub, href }: { title: string; sub: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-[22px] border border-slate-200/70 bg-white/70 px-4 py-4 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950 dark:text-white">{title}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
        </div>
        <span className="text-lg text-slate-300 dark:text-slate-600">+</span>
      </div>
    </Link>
  )
}

function StatusTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'default' | 'success' | 'warning' | 'info'
}) {
  const map = {
    default: 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-white',
    success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
    warning: 'bg-amber-500/12 text-amber-700 dark:text-amber-200',
    info: 'bg-sky-500/12 text-sky-700 dark:text-sky-200',
  } as const

  return (
    <div className={`rounded-[22px] p-4 ${map[tone]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="h-full animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
  )
}

function MiniChartSkeleton() {
  return (
    <div>
      <div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
      <div className="mt-3 h-44 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60" />
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <DashboardContent />
    </Suspense>
  )
}

