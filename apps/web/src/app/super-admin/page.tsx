'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Badge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { fmt, fmtDate } from '@/lib/utils'
import {
  type AnalyticsRange,
  useAdminDashboardOverview,
  useAdminPlanDistribution,
  useAdminRevenueAnalytics,
  useSuperAdminOverview,
  useSuperAdminOverviewAnalytics,
} from '@/lib/super-admin'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

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

  // Each widget loads independently — a slow query only skeletons its own card.
  const overview = useSuperAdminOverview()
  const dashboard = useAdminDashboardOverview()
  const planDistribution = useAdminPlanDistribution()
  const revenue = useAdminRevenueAnalytics()
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

  const kpisLoading = overview.isLoading || dashboard.isLoading

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Platform intelligence"
        title="Platform overview"
        description="Health, revenue, and adoption at a glance. Manage tenants in Businesses, money in Billing, and packaging in Plans."
      />

      {kpisLoading ? (
        <WidgetSkeleton className="mb-6 h-[280px]" />
      ) : (
        <MetricGrid className="mb-6">
          <MetricCard
            label="Total businesses"
            value={String(dashboard.data?.totalBusinesses ?? 0)}
            hint={`${overview.data?.platformHealth?.activeBusinesses ?? 0} active • ${overview.data?.platformHealth?.suspendedBusinesses ?? 0} suspended`}
            tone="brand"
          />
          <MetricCard
            label="Active subscriptions"
            value={String(dashboard.data?.activeSubscriptions ?? 0)}
            hint={`Trial ${dashboard.data?.trialSubscriptions ?? 0} • Expired ${dashboard.data?.expiredSubscriptions ?? 0}`}
            tone="success"
          />
          <MetricCard
            label="Subscription revenue"
            value={fmt(overview.data?.financialVolume?.totalSubscriptionRevenueTillDate ?? 0)}
            hint={`All collections till date • ${dashboard.data?.failedPaymentsCount ?? 0} failed payments`}
            tone={(dashboard.data?.failedPaymentsCount ?? 0) > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label="Monthly run-rate"
            value={fmt(overview.data?.financialVolume?.monthlyRevenueRunRate ?? 0)}
            hint={`${overview.data?.financialVolume?.pastDueAccounts ?? 0} accounts past due`}
            tone={(overview.data?.financialVolume?.pastDueAccounts ?? 0) > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            label="Total users"
            value={String(dashboard.data?.totalUsers ?? 0)}
            hint={`${overview.data?.platformHealth?.dailyActiveUsers ?? 0} active today`}
            tone="info"
          />
          <MetricCard
            label="Platform GMV"
            value={fmt(overview.data?.financialVolume?.totalGMV ?? 0)}
            hint={`${fmt(overview.data?.financialVolume?.todayGMV ?? 0)} processed today`}
            tone="success"
          />
        </MetricGrid>
      )}

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Plan distribution</div>
          {planDistribution.isLoading ? (
            <WidgetSkeleton className="h-[260px]" />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planDistribution.data ?? []}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="planName" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [value, 'Businesses']} />
                  <Bar dataKey="numberOfBusinesses" fill="#6366f1" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Revenue by plan</div>
          {revenue.isLoading ? (
            <WidgetSkeleton className="h-[260px]" />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue.data?.revenueByPlan ?? []}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="planName" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [fmt(value), 'Revenue']} />
                  <Bar dataKey="revenue" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

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
                      ? 'bg-indigo-600 text-white'
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

        {analytics.isLoading ? (
          <WidgetSkeleton className="h-[400px]" />
        ) : (
          <>
            <div className="mb-4 grid gap-4 md:grid-cols-4">
              <MiniStat label="Selected GMV" value={fmt(analytics.data?.summary?.gmv ?? 0)} />
              <MiniStat label="Selected subscription" value={fmt(analytics.data?.summary?.subscriptionRevenue ?? 0)} />
              <MiniStat label="New businesses" value={String(analytics.data?.summary?.newBusinesses ?? 0)} />
              <MiniStat label="Active users" value={String(analytics.data?.summary?.activeUsers ?? 0)} />
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [name.includes('Revenue') || name.includes('GMV') ? fmt(value) : value, name]}
                    labelFormatter={(value) => `Date: ${String(value)}`}
                  />
                  <Line type="monotone" dataKey="gmv" name="GMV" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="subscriptionRevenue" name="Subscription Revenue" stroke="#10b981" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Business snapshot</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Top businesses by GMV</div>
            </div>
            <Link href="/super-admin/businesses" className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              Manage businesses →
            </Link>
          </div>
          {overview.isLoading ? (
            <WidgetSkeleton className="h-[300px]" />
          ) : (
            <div className="grid gap-4">
              {(overview.data?.topBusinesses ?? []).map((business: any) => (
                <div key={business.id} className="rounded-2xl border border-slate-200/70 bg-white/75 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">{business.name}</div>
                    <Badge variant={business.isActive ? 'success' : 'danger'}>{business.isActive ? 'ACTIVE' : 'SUSPENDED'}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    {business.city} • {business.users} users • {business.customers} customers • {business.orders} orders
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <MiniStat label="GMV" value={fmt(business.gmv)} />
                    <MiniStat label="Outstanding" value={fmt(business.outstanding)} />
                    <MiniStat label="MRR" value={fmt(business.monthlySubscriptionAmount)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Audit trail</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Recent activity</div>
          </div>
          {overview.isLoading ? (
            <WidgetSkeleton className="h-[300px]" />
          ) : (
            <div className="space-y-3">
              {(overview.data?.activityFeed ?? []).length === 0 && (
                <div className="py-8 text-center text-sm text-slate-400">No recent platform activity.</div>
              )}
              {(overview.data?.activityFeed ?? []).map((item: any) => (
                <div key={item.id} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.kind === 'ERROR' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium capitalize text-slate-800 dark:text-slate-200">
                      {String(item.title ?? '').toLowerCase()}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {item.description} • {fmtDate(item.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickLink href="/super-admin/billing" title="Billing" description="Payments and Razorpay webhook trail, paginated." />
        <QuickLink href="/super-admin/plans" title="Plans" description="Pricing, limits, and feature gates per plan." />
        <QuickLink href="/super-admin/users" title="Users" description="Every owner and munim across all tenants." />
      </div>
    </SuperAdminShell>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/70 px-3 py-2.5 dark:border-slate-800">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200/70 bg-white/75 p-5 transition-colors hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-indigo-700"
    >
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-slate-950 dark:text-white">{title}</div>
        <span className="text-indigo-600 transition-transform group-hover:translate-x-0.5 dark:text-indigo-400" aria-hidden>
          →
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div>
    </Link>
  )
}

function WidgetSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/60 ${className}`} />
}
