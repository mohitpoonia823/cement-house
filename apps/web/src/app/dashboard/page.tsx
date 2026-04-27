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

function percentageLabel(value: number | undefined, compareLabel: string) {
  const safeValue = Number(value ?? 0)
  if (safeValue === 0) return `Flat vs ${compareLabel.toLowerCase()}`
  return `${safeValue > 0 ? '+' : ''}${safeValue.toFixed(1)}% vs ${compareLabel.toLowerCase()}`
}

function granularityLabel(granularity: string | undefined) {
  if (granularity === 'month') return 'Monthly view'
  if (granularity === 'week') return 'Weekly view'
  return 'Daily view'
}

function emptyIfBlank(value: string | null) {
  return value?.trim() ?? ''
}

function DashboardContent() {
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
        }
      : { range: activeRange }

  const { data, isLoading } = useDashboard(dashboardQuery)
  const { data: customers } = useCustomers()
  const sendReminders = useSendReminders()
  const { user } = useAuthStore()

  const overdueCustomers = (customers ?? []).filter((customer: any) => Number(customer.balance) > 0)
  const compareLabel = data?.range?.comparisonLabel ?? 'previous period'
  const selectedLabel = data?.range?.label ?? 'Last 7 days'
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
      window.alert('No customers with outstanding balance found.')
      return
    }

    const confirmed = window.confirm(`Send WhatsApp reminders to ${overdueCustomers.length} customer(s) with outstanding balance?`)
    if (!confirmed) return

    try {
      const result = await sendReminders.mutateAsync(overdueCustomers.map((customer: any) => customer.id))
      window.alert(`Sent ${result.data.sent} reminder(s).`)
    } catch (error: any) {
      window.alert(error?.response?.data?.error ?? 'Failed to send reminders.')
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <PageLoader />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Business pulse"
        title="Analytics-first command center"
        description="Switch between 7-day, monthly, 2-month, yearly, or custom windows without leaving the dashboard."
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
                  {option.label}
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
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">to</span>
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
                Apply range
              </button>
            </div>

            {customRangeInvalid ? (
              <div className="text-right text-xs font-medium text-rose-600 dark:text-rose-300">
                End date must be on or after start date.
              </div>
            ) : null}
          </div>
        }
      />

      <Card className="mb-6">
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr_0.8fr_0.8fr]">
          <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/55">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Current window</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{selectedLabel}</div>
              <Badge variant="info">{granularityLabel(data?.range?.granularity)}</Badge>
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Comparing against {compareLabel.toLowerCase()} with live inventory and delivery context retained below.
            </div>
          </div>

          <InsightTile
            label="Peak sales"
            value={data?.highlights?.strongestBucketSales ? fmt(data.highlights.strongestBucketSales) : fmt(0)}
            hint={data?.highlights?.strongestBucketLabel ?? 'No standout period yet'}
          />
          <InsightTile
            label="Average pace"
            value={fmt(data?.highlights?.averagePerBucket ?? 0)}
            hint={granularityLabel(data?.range?.granularity)}
          />
          <InsightTile
            label="Today so far"
            value={fmt(data?.todaySnapshot?.sales ?? 0)}
            hint={`${data?.todaySnapshot?.orderCount ?? 0} orders | ${fmt(data?.todaySnapshot?.collected ?? 0)} collected`}
          />
        </div>
      </Card>

      <MetricGrid className="mb-6">
        <MetricCard
          label="Sales in range"
          value={fmt(data?.summary?.totalSales ?? 0)}
          hint={`${data?.summary?.orderCount ?? 0} orders booked | ${percentageLabel(data?.comparison?.salesDeltaPct, compareLabel)}`}
          tone="brand"
        />
        <MetricCard
          label="Cash collected"
          value={fmt(data?.summary?.cashCollected ?? 0)}
          hint={`${data?.summary?.collectionRate ?? 0}% collection rate | ${percentageLabel(data?.comparison?.collectedDeltaPct, compareLabel)}`}
          tone="success"
        />
        <MetricCard
          label="Outstanding in range"
          value={fmt(data?.summary?.totalOutstanding ?? 0)}
          hint={`${data?.summary?.activeCustomersInRange ?? 0} customers billed | ${percentageLabel(data?.comparison?.outstandingDeltaPct, compareLabel)}`}
          tone={(data?.summary?.totalOutstanding ?? 0) > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Inventory pressure"
          value={String(data?.summary?.lowStockCount ?? 0)}
          hint={`${data?.summary?.activeMaterials ?? 0} active SKUs | Today ${data?.todaySnapshot?.orderCount ?? 0} orders`}
          tone={(data?.summary?.lowStockCount ?? 0) > 0 ? 'danger' : 'default'}
        />
      </MetricGrid>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Revenue rhythm</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Sales vs collections in {selectedLabel.toLowerCase()}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <LegendDot color="#0ea5e9" label="Sales" />
                <LegendDot color="#10b981" label="Collections" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="info">{granularityLabel(data?.range?.granularity)}</Badge>
              <Badge>Auto refresh</Badge>
            </div>
          </div>
          <div className="h-80">
            <RevenueRhythmChart data={data?.revenueSeries ?? []} selectedLabel={selectedLabel} />
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Fulfilment</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Delivery workload</div>
            </div>
            <Badge>Live snapshot</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusTile label="Total" value={data?.deliverySnapshot?.total ?? 0} tone="default" />
            <StatusTile label="Scheduled" value={data?.deliverySnapshot?.SCHEDULED ?? 0} tone="info" />
            <StatusTile label="In transit" value={data?.deliverySnapshot?.IN_TRANSIT ?? 0} tone="warning" />
            <StatusTile label="Delivered" value={data?.deliverySnapshot?.DELIVERED ?? 0} tone="success" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <DonutBreakdown title="Order mix in range" data={data?.orderStatus ?? []} />
            <DonutBreakdown title="Customer risk mix" data={data?.riskSegments ?? []} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr_0.9fr_0.85fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Recent flow</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Latest orders in selection</div>
            </div>
            <Badge>{`${data?.recentOrders?.length ?? 0} tracked`}</Badge>
          </div>
          {(data?.recentOrders ?? []).length > 0 ? (
            <div className="space-y-3">
              {(data?.recentOrders ?? []).map((order: any) => (
                <div key={order.id} className="rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">{order.orderNumber}</div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{order.customerName}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.itemSummary || 'Mixed material order'}</div>
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
              title="No orders in the selected range"
              description="Try widening the date window or use the custom filter to inspect a different time period."
            />
          )}
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Customer concentration</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Top revenue accounts</div>
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
                        {customer.orderCount} orders | Outstanding {fmt(customer.outstanding)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">{fmt(customer.totalSales)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDashboardState
              title="No customer billing in this range"
              description="Top accounts will appear here once orders are present in the selected period."
            />
          )}
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Inventory watch</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Items needing attention</div>
          </div>
          <div className="space-y-3">
            {(data?.stockAlerts ?? []).length > 0 ? (
              (data?.stockAlerts ?? []).map((material: any) => (
                <div key={material.id} className="rounded-[22px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">{material.name}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Threshold {material.minThreshold} {material.unit}
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
                title="All tracked items are healthy"
                description="No low-stock or out-of-stock materials need action right now."
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Quick actions</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Move faster</div>
          </div>
          <div className="space-y-3">
            <ActionLink title="New order" sub="Create and dispatch a sales order" href="/orders/new" />
            <ActionLink title="Record payment" sub="Update khata and clear balances" href="/khata" />
            <ActionLink title="Stock purchase" sub="Add inventory or replenish fast movers" href="/inventory" />
            <ActionLink title="Create delivery" sub="Manage challan and delivery status" href="/delivery" />
            {user?.role === 'OWNER' ? (
              <button
                onClick={handleSendReminders}
                disabled={sendReminders.isPending}
                className="w-full rounded-[22px] border border-slate-200/70 bg-white/70 px-4 py-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">
                      {sendReminders.isPending ? 'Sending reminders...' : 'Send reminders'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Trigger WhatsApp reminders for {overdueCustomers.length} customer{overdueCustomers.length === 1 ? '' : 's'} with dues
                    </div>
                  </div>
                  <Badge variant="warning">Live</Badge>
                </div>
              </button>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200/80 px-4 py-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Reminder sending is available for owner accounts.
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
