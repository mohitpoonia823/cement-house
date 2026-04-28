'use client'

import { useMemo, useState } from 'react'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { type AnalyticsRange, useSuperAdminOverview, useSuperAdminOverviewAnalytics } from '@/lib/super-admin'
import { fmt } from '@/lib/utils'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const tabs = [
  { id: 'health', label: 'Platform Health' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'adoption', label: 'Feature Adoption' },
] as const

const ranges: Array<{ label: string; value: AnalyticsRange }> = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: 'Custom', value: 'CUSTOM' },
]

const pieColors = ['#0ea5e9', '#22c55e', '#f97316', '#8b5cf6', '#ef4444']

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export default function SuperAdminMetricsPage() {
  const today = new Date()
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('health')
  const [range, setRange] = useState<AnalyticsRange>('1M')
  const [startDate, setStartDate] = useState<string>(toInputDate(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())))
  const [endDate, setEndDate] = useState<string>(toInputDate(today))

  const { data, isLoading } = useSuperAdminOverview()
  const analytics = useSuperAdminOverviewAnalytics({
    range,
    startDate: range === 'CUSTOM' ? startDate : undefined,
    endDate: range === 'CUSTOM' ? endDate : undefined,
  })

  const points = analytics.data?.points ?? []

  const trendData = useMemo(
    () => points.map((point) => ({ ...point, dateLabel: point.date.slice(5) })),
    [points]
  )

  const adoptionBars = useMemo(
    () => [
      { name: 'Challan PDFs', value: data?.featureAdoption?.challanPdfsToday ?? 0 },
      { name: 'Reminders', value: data?.featureAdoption?.remindersSentToday ?? 0 },
      { name: 'Pro', value: data?.featureAdoption?.businessesOnPro ?? 0 },
      { name: 'Trial', value: data?.featureAdoption?.businessesInTrial ?? 0 },
    ],
    [data]
  )

  const statusPie = useMemo(
    () => [
      { name: 'Active', value: data?.platformHealth?.activeBusinesses ?? 0 },
      { name: 'Suspended', value: data?.platformHealth?.suspendedBusinesses ?? 0 },
    ],
    [data]
  )

  const revenuePie = useMemo(
    () => [
      { name: 'GMV (range)', value: analytics.data?.summary?.gmv ?? 0 },
      { name: 'Subscription (range)', value: analytics.data?.summary?.subscriptionRevenue ?? 0 },
    ],
    [analytics.data?.summary]
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
        eyebrow="Metric workspace"
        title="Tabbed metrics with operational depth"
        description="Each tab now includes chart-based insights, not just top-line counters."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ranges.map((item) => {
          const active = range === item.value
          return (
            <button
              key={item.value}
              onClick={() => setRange(item.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'border border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          )
        })}
        {range === 'CUSTOM' && (
          <div className="ml-1 flex items-center gap-2">
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

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'border border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === 'health' && (
        <>
          <MetricGrid>
            <MetricCard label="Total businesses" value={String(data?.platformHealth?.totalBusinesses ?? 0)} hint="Registered companies" tone="brand" />
            <MetricCard label="Active businesses" value={String(data?.platformHealth?.activeBusinesses ?? 0)} hint="Currently operating" tone="success" />
            <MetricCard label="Suspended businesses" value={String(data?.platformHealth?.suspendedBusinesses ?? 0)} hint="Need intervention" tone="warning" />
            <MetricCard label="Active users (range)" value={String(analytics.data?.summary?.activeUsers ?? 0)} hint="Distinct active users in selected range" tone="info" />
          </MetricGrid>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <Card>
              <div className="mb-4 text-sm font-semibold text-slate-950 dark:text-white">Active users and business signups trend</div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="activeUsers" name="Active Users" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="newBusinesses" name="New Businesses" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="mb-4 text-sm font-semibold text-slate-950 dark:text-white">Business status distribution</div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92}>
                      {statusPie.map((entry, index) => (
                        <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, 'Businesses']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'revenue' && (
        <>
          <MetricGrid>
            <MetricCard label="Total GMV" value={fmt(data?.financialVolume?.totalGMV ?? 0)} hint="All non-cancelled sales" tone="brand" />
            <MetricCard label="Range GMV" value={fmt(analytics.data?.summary?.gmv ?? 0)} hint="GMV in selected range" tone="success" />
            <MetricCard label="Range subscription" value={fmt(analytics.data?.summary?.subscriptionRevenue ?? 0)} hint="Subscription collections in selected range" tone="info" />
            <MetricCard label="Till date subscription" value={fmt(analytics.data?.summary?.totalSubscriptionRevenueTillDate ?? 0)} hint="Total platform money from subscriptions" tone="warning" />
          </MetricGrid>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <Card>
              <div className="mb-4 text-sm font-semibold text-slate-950 dark:text-white">Revenue trend (GMV vs subscription)</div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value: number) => [fmt(value), '']} />
                    <Legend />
                    <Line type="monotone" dataKey="gmv" name="GMV" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="subscriptionRevenue" name="Subscription Revenue" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="mb-4 text-sm font-semibold text-slate-950 dark:text-white">Range revenue mix</div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revenuePie} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92}>
                      {revenuePie.map((entry, index) => (
                        <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [fmt(value), 'Amount']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === 'adoption' && (
        <>
          <MetricGrid>
            <MetricCard label="Challan PDFs today" value={String(data?.featureAdoption?.challanPdfsToday ?? 0)} hint="Dispatch paperwork generated" tone="brand" />
            <MetricCard label="Reminders sent today" value={String(data?.featureAdoption?.remindersSentToday ?? 0)} hint="WhatsApp reminders sent" tone="success" />
            <MetricCard label="Businesses on Pro" value={String(data?.featureAdoption?.businessesOnPro ?? 0)} hint="Paid adoption" tone="info" />
            <MetricCard label="Businesses in Trial" value={String(data?.featureAdoption?.businessesInTrial ?? 0)} hint="Activation pipeline" tone="warning" />
          </MetricGrid>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <Card>
              <div className="mb-4 text-sm font-semibold text-slate-950 dark:text-white">Adoption signal comparison</div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adoptionBars}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="mb-4 text-sm font-semibold text-slate-950 dark:text-white">Daily adoption momentum</div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="newBusinesses" name="New businesses" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="activeUsers" name="Active users" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Operational insight</div>
        <div className="mt-3 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Selected window: <span className="font-semibold text-slate-900 dark:text-white">{analytics.data?.startDate?.slice(0, 10)}</span> to <span className="font-semibold text-slate-900 dark:text-white">{analytics.data?.endDate?.slice(0, 10)}</span>.
          Use this page to compare growth, monetization, and engagement in one place before drilling down into businesses and users.
        </div>
      </Card>
    </SuperAdminShell>
  )
}
