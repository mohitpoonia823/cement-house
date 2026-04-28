'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Badge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { fmt } from '@/lib/utils'
import { type AnalyticsRange, useSuperAdminOverview, useSuperAdminOverviewAnalytics } from '@/lib/super-admin'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const rangeOptions: Array<{ label: string; value: AnalyticsRange }> = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'Custom', value: 'CUSTOM' },
]

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export default function SuperAdminOverviewPage() {
  const now = new Date()
  const [range, setRange] = useState<AnalyticsRange>('1M')
  const [startDate, setStartDate] = useState<string>(toInputDate(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())))
  const [endDate, setEndDate] = useState<string>(toInputDate(now))
  const { data, isLoading } = useSuperAdminOverview()
  const analytics = useSuperAdminOverviewAnalytics({
    range,
    startDate: range === 'CUSTOM' ? startDate : undefined,
    endDate: range === 'CUSTOM' ? endDate : undefined,
  })
  const chartData = useMemo(
    () =>
      (analytics.data?.points ?? []).map((point) => ({
        ...point,
        dateLabel: point.date,
      })),
    [analytics.data?.points]
  )

  if (isLoading || analytics.isLoading) {
    return (
      <SuperAdminShell>
        <PageLoader />
      </SuperAdminShell>
    )
  }

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Platform intelligence"
        title="Overview built for scale"
        description="Use summary signals here, then jump into paginated businesses, users, and metric tabs for deep operational work."
      />

      <MetricGrid className="mb-6">
        <MetricCard
          label="Active businesses"
          value={String(data?.platformHealth?.activeBusinesses ?? 0)}
          hint={`${data?.platformHealth?.suspendedBusinesses ?? 0} suspended businesses`}
          tone="brand"
        />
        <MetricCard
          label="Daily active users"
          value={String(data?.platformHealth?.dailyActiveUsers ?? 0)}
          hint={`${data?.platformHealth?.totalMunims ?? 0} munims and ${data?.platformHealth?.totalOwners ?? 0} owners active on platform`}
          tone="info"
        />
        <MetricCard
          label="Platform GMV"
          value={fmt(data?.financialVolume?.totalGMV ?? 0)}
          hint={`${fmt(data?.financialVolume?.todayGMV ?? 0)} processed today`}
          tone="success"
        />
        <MetricCard
          label="Revenue run-rate"
          value={fmt(data?.financialVolume?.monthlyRevenueRunRate ?? 0)}
          hint={`${data?.financialVolume?.pastDueAccounts ?? 0} accounts are past due`}
          tone={(data?.financialVolume?.pastDueAccounts ?? 0) > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Subscription revenue till today"
          value={fmt(data?.financialVolume?.totalSubscriptionRevenueTillDate ?? analytics.data?.summary?.totalSubscriptionRevenueTillDate ?? 0)}
          hint="All successful subscription collections till date"
          tone="success"
        />
      </MetricGrid>

      <Card className="mb-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Revenue analytics</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">GMV and subscription trends</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {rangeOptions.map((option) => {
              const active = range === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => setRange(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                      : 'border border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
            {range === 'CUSTOM' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mb-4 grid gap-4 md:grid-cols-4">
          <MiniStat label="Selected GMV" value={fmt(analytics.data?.summary?.gmv ?? 0)} />
          <MiniStat label="Selected subscription" value={fmt(analytics.data?.summary?.subscriptionRevenue ?? 0)} />
          <MiniStat label="New businesses" value={String(analytics.data?.summary?.newBusinesses ?? 0)} />
          <MiniStat label="Active users" value={String(analytics.data?.summary?.activeUsers ?? 0)} />
        </div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [name.includes('Revenue') || name.includes('GMV') ? fmt(value) : value, name]}
                labelFormatter={(value) => `Date: ${String(value)}`}
              />
              <Line type="monotone" dataKey="gmv" name="GMV" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="subscriptionRevenue" name="Subscription Revenue" stroke="#10b981" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Business snapshot</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Top businesses by GMV</div>
          </div>
          <Link href="/super-admin/businesses" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            Open paginated businesses
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {(data?.topBusinesses ?? []).map((business: any) => (
            <div key={business.id} className="rounded-[26px] border border-slate-200/70 bg-white/75 p-5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{business.name}</div>
                <Badge variant={business.isActive ? 'success' : 'danger'}>{business.isActive ? 'ACTIVE' : 'SUSPENDED'}</Badge>
              </div>
              <div className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                {business.city} • {business.users} users • {business.customers} customers • {business.orders} orders
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStat label="GMV" value={fmt(business.gmv)} />
                <MiniStat label="Outstanding" value={fmt(business.outstanding)} />
                <MiniStat label="MRR" value={fmt(business.monthlySubscriptionAmount)} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </SuperAdminShell>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}
