'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Badge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'
import {
  type AnalyticsRange,
  useAdminBusinesses,
  useAdminDashboardOverview,
  useAdminPayments,
  useAdminPlanDistribution,
  useAdminRevenueAnalytics,
  useAdminWebhooks,
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
  const qc = useQueryClient()
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
  const [paymentStatus, setPaymentStatus] = useState<'' | 'SUCCESS' | 'FAILED' | 'PENDING'>('')
  const [paymentStartDate, setPaymentStartDate] = useState<string>('')
  const [paymentEndDate, setPaymentEndDate] = useState<string>('')
  const dashboard = useAdminDashboardOverview()
  const planDistribution = useAdminPlanDistribution()
  const revenue = useAdminRevenueAnalytics()
  const payments = useAdminPayments({ status: paymentStatus, startDate: paymentStartDate, endDate: paymentEndDate })
  const webhooks = useAdminWebhooks()
  const dashboardBusinesses = useAdminBusinesses()
  const [alert, setAlert] = useState<{ tone: 'success' | 'danger' | 'info'; message: string } | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<{ businessId: string; name: string } | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [planTarget, setPlanTarget] = useState<{ businessId: string; name: string; currentPlan: 'STARTER' | 'PRO' | 'ENTERPRISE' } | null>(null)
  const [targetPlan, setTargetPlan] = useState<'STARTER' | 'PRO' | 'ENTERPRISE'>('PRO')
  const [planEffectiveMode, setPlanEffectiveMode] = useState<'IMMEDIATE' | 'FUTURE'>('IMMEDIATE')
  const [extendTarget, setExtendTarget] = useState<{ businessId: string; name: string; subscriptionEndsAt: string | null } | null>(null)
  const [extendDays, setExtendDays] = useState(30)

  const refreshAll = () => qc.invalidateQueries({ queryKey: ['super-admin'] })
  const suspendBusiness = useMutation({
    mutationFn: async (payload: { businessId: string; reason?: string }) =>
      api.post(`/api/super-admin/businesses/${payload.businessId}/suspend`, { reason: payload.reason }).then((r) => r.data.data),
    onSuccess: () => {
      setAlert({ tone: 'success', message: 'Business suspended successfully.' })
      setSuspendTarget(null)
      setSuspendReason('')
      refreshAll()
    },
    onError: (err: any) =>
      setAlert({ tone: 'danger', message: err?.response?.data?.error ?? 'Failed to suspend business.' }),
  })
  const changePlan = useMutation({
    mutationFn: async (payload: { businessId: string; plan: 'STARTER' | 'PRO' | 'ENTERPRISE' }) =>
      api.post(`/api/super-admin/businesses/${payload.businessId}/change-plan`, { plan: payload.plan }).then((r) => r.data.data),
    onSuccess: () => {
      setAlert({ tone: 'success', message: 'Plan updated successfully.' })
      setPlanTarget(null)
      refreshAll()
    },
    onError: (err: any) =>
      setAlert({ tone: 'danger', message: err?.response?.data?.error ?? 'Failed to change plan.' }),
  })
  const extendSubscription = useMutation({
    mutationFn: async (payload: { businessId: string; days: number }) =>
      api.post(`/api/super-admin/businesses/${payload.businessId}/extend-subscription`, { days: payload.days }).then((r) => r.data.data),
    onSuccess: () => {
      setAlert({ tone: 'success', message: 'Subscription extended successfully.' })
      setExtendTarget(null)
      setExtendDays(30)
      refreshAll()
    },
    onError: (err: any) =>
      setAlert({ tone: 'danger', message: err?.response?.data?.error ?? 'Failed to extend subscription.' }),
  })

  if (isLoading || analytics.isLoading || dashboard.isLoading || planDistribution.isLoading || revenue.isLoading || payments.isLoading || webhooks.isLoading || dashboardBusinesses.isLoading) {
    return (
      <SuperAdminShell>
        <PageLoader />
      </SuperAdminShell>
    )
  }

  return (
    <SuperAdminShell>
      {alert ? (
        <div className={`mb-4 rounded-xl px-3 py-2 text-sm ${
          alert.tone === 'success'
            ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
            : alert.tone === 'danger'
              ? 'border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-200'
              : 'border border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200'
        }`}>
          {alert.message}
        </div>
      ) : null}
      <SectionHeader
        eyebrow="Platform intelligence"
        title="Overview built for scale"
        description="Use summary signals here, then jump into paginated businesses, users, and metric tabs for deep operational work."
      />

      <MetricGrid className="mb-6">
        <MetricCard
          label="Total businesses"
          value={String(dashboard.data?.totalBusinesses ?? 0)}
          hint="All tenants"
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
          value={fmt(dashboard.data?.totalRevenue ?? 0)}
          hint={`Failed payments ${dashboard.data?.failedPaymentsCount ?? 0}`}
          tone={(dashboard.data?.failedPaymentsCount ?? 0) > 0 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Total users"
          value={String(dashboard.data?.totalUsers ?? 0)}
          hint="Across all tenants"
          tone="info"
        />
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

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Plan distribution</div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planDistribution.data ?? []}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="planName" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [value, 'Businesses']} />
                <Bar dataKey="numberOfBusinesses" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Revenue by plan</div>
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

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payments monitoring</div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as '' | 'SUCCESS' | 'FAILED' | 'PENDING')} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                <option value="">All status</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAILED">FAILED</option>
                <option value="PENDING">PENDING</option>
              </select>
              <input type="date" value={paymentStartDate} onChange={(e) => setPaymentStartDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
              <input type="date" value={paymentEndDate} onChange={(e) => setPaymentEndDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-2 py-2 text-left">Payment</th>
                  <th className="px-2 py-2 text-left">Plan</th>
                  <th className="px-2 py-2 text-left">Amount</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {(payments.data ?? []).slice(0, 120).map((row) => (
                  <tr key={row.paymentId} className="border-t border-slate-200/70 dark:border-slate-800">
                    <td className="px-2 py-2">{row.paymentId.slice(0, 8)}...</td>
                    <td className="px-2 py-2">{row.planName}</td>
                    <td className="px-2 py-2">{fmt(row.amount)}</td>
                    <td className="px-2 py-2"><Badge variant={row.status === 'SUCCESS' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'}>{row.status}</Badge></td>
                    <td className="px-2 py-2">{fmtDate(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Webhook logs</div>
          <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-2 py-2 text-left">Event</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Processed</th>
                </tr>
              </thead>
              <tbody>
                {(webhooks.data ?? []).slice(0, 120).map((row) => (
                  <tr key={row.eventId} className="border-t border-slate-200/70 dark:border-slate-800">
                    <td className="px-2 py-2">{row.eventId.slice(0, 10)}...</td>
                    <td className="px-2 py-2">{row.eventType}</td>
                    <td className="px-2 py-2"><Badge variant={row.status === 'PROCESSED' ? 'success' : 'warning'}>{row.status}</Badge></td>
                    <td className="px-2 py-2">{row.processedAt ? fmtDate(row.processedAt) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Businesses</div>
        <div className="max-h-[340px] overflow-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-2 py-2 text-left">Business</th>
                <th className="px-2 py-2 text-left">Plan</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-left">Ends</th>
                <th className="px-2 py-2 text-left">Created</th>
                <th className="px-2 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(dashboardBusinesses.data ?? []).slice(0, 200).map((row) => (
                <tr key={row.businessId} className="border-t border-slate-200/70 dark:border-slate-800">
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{row.plan}</td>
                  <td className="px-2 py-2"><Badge variant={row.subscriptionStatus === 'ACTIVE' ? 'success' : row.subscriptionStatus === 'SUSPENDED' ? 'danger' : 'warning'}>{row.subscriptionStatus}</Badge></td>
                  <td className="px-2 py-2">{row.subscriptionEndsAt ? fmtDate(row.subscriptionEndsAt) : '-'}</td>
                  <td className="px-2 py-2">{fmtDate(row.createdAt)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md border border-rose-300 px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        onClick={() => setSuspendTarget({ businessId: row.businessId, name: row.name })}
                      >
                        Suspend
                      </button>
                      <button
                        className="rounded-md border border-sky-300 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-950/30"
                        onClick={() => {
                          setPlanTarget({ businessId: row.businessId, name: row.name, currentPlan: row.plan })
                          setTargetPlan(row.plan)
                          setPlanEffectiveMode('IMMEDIATE')
                        }}
                      >
                        Change plan
                      </button>
                      <button
                        className="rounded-md border border-emerald-300 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                        onClick={() => {
                          setExtendTarget({ businessId: row.businessId, name: row.name, subscriptionEndsAt: row.subscriptionEndsAt })
                          setExtendDays(30)
                        }}
                      >
                        Extend
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {suspendTarget ? (
        <ConfirmModal
          title="Suspend business"
          description={`Suspend ${suspendTarget.name}? This will lock business access.`}
          confirmLabel={suspendBusiness.isPending ? 'Suspending...' : 'Suspend'}
          confirmTone="danger"
          onClose={() => {
            if (suspendBusiness.isPending) return
            setSuspendTarget(null)
          }}
          onConfirm={() => suspendBusiness.mutate({ businessId: suspendTarget.businessId, reason: suspendReason || undefined })}
        >
          <textarea
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Optional reason"
            className="h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </ConfirmModal>
      ) : null}

      {planTarget ? (
        <ConfirmModal
          title="Change plan"
          description={`Change plan for ${planTarget.name}.`}
          confirmLabel={changePlan.isPending ? 'Saving...' : 'Apply'}
          confirmTone="primary"
          onClose={() => {
            if (changePlan.isPending) return
            setPlanTarget(null)
          }}
          onConfirm={() => changePlan.mutate({ businessId: planTarget.businessId, plan: targetPlan })}
        >
          <div className="grid gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Plan</label>
            <select
              value={targetPlan}
              onChange={(e) => setTargetPlan(e.target.value as 'STARTER' | 'PRO' | 'ENTERPRISE')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="STARTER">STARTER</option>
              <option value="PRO">PRO</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Effective behavior</label>
            <select
              value={planEffectiveMode}
              onChange={(e) => setPlanEffectiveMode(e.target.value as 'IMMEDIATE' | 'FUTURE')}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="IMMEDIATE">Immediate</option>
              <option value="FUTURE">At next cycle</option>
            </select>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Current backend behavior: updates immediately. Future-cycle scheduling is UI-ready, API support can be added next.
            </div>
          </div>
        </ConfirmModal>
      ) : null}

      {extendTarget ? (
        <ConfirmModal
          title="Extend subscription"
          description={`Extend ${extendTarget.name} by selected days.`}
          confirmLabel={extendSubscription.isPending ? 'Extending...' : 'Extend'}
          confirmTone="primary"
          onClose={() => {
            if (extendSubscription.isPending) return
            setExtendTarget(null)
          }}
          onConfirm={() => extendSubscription.mutate({ businessId: extendTarget.businessId, days: extendDays })}
        >
          <div className="grid gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Days</label>
            <input
              type="number"
              min={1}
              max={3650}
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value || 1))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="text-xs text-slate-500 dark:text-slate-400">
              New expected end date:{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {fmtDate(
                  (() => {
                    const base = extendTarget.subscriptionEndsAt ? new Date(extendTarget.subscriptionEndsAt) : new Date()
                    const next = new Date(base)
                    next.setDate(next.getDate() + Math.max(1, extendDays))
                    return next.toISOString()
                  })(),
                )}
              </span>
            </div>
          </div>
        </ConfirmModal>
      ) : null}
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

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmTone,
  onClose,
  onConfirm,
  children,
}: {
  title: string
  description: string
  confirmLabel: string
  confirmTone: 'primary' | 'danger'
  onClose: () => void
  onConfirm: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-lg font-semibold text-slate-950 dark:text-slate-100">{title}</div>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</div>
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${
              confirmTone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
