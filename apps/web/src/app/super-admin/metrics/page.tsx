'use client'
import { useState } from 'react'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { fmt } from '@/lib/utils'
import { useSuperAdminOverview } from '@/lib/super-admin'

const tabs = [
  { id: 'health', label: 'Platform Health' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'adoption', label: 'Feature Adoption' },
] as const

export default function SuperAdminMetricsPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('health')
  const { data, isLoading } = useSuperAdminOverview()

  if (isLoading) {
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
        title="Tabbed metrics for large-scale monitoring"
        description="Separate health, revenue, and adoption views so the team can focus on one operating question at a time."
      />

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
        <MetricGrid>
          <MetricCard label="Total businesses" value={String(data?.platformHealth?.totalBusinesses ?? 0)} hint="Registered companies on the platform" tone="brand" />
          <MetricCard label="Active businesses" value={String(data?.platformHealth?.activeBusinesses ?? 0)} hint="Currently allowed to operate" tone="success" />
          <MetricCard label="Suspended businesses" value={String(data?.platformHealth?.suspendedBusinesses ?? 0)} hint="Need support or compliance follow-up" tone="warning" />
          <MetricCard label="DAU" value={String(data?.platformHealth?.dailyActiveUsers ?? 0)} hint="Users seen today" tone="info" />
        </MetricGrid>
      )}

      {tab === 'revenue' && (
        <MetricGrid>
          <MetricCard label="Total GMV" value={fmt(data?.financialVolume?.totalGMV ?? 0)} hint="All non-cancelled sales across tenants" tone="brand" />
          <MetricCard label="Today GMV" value={fmt(data?.financialVolume?.todayGMV ?? 0)} hint="Sales booked today" tone="success" />
          <MetricCard label="Revenue run-rate" value={fmt(data?.financialVolume?.monthlyRevenueRunRate ?? 0)} hint="Current recurring subscription revenue" tone="info" />
          <MetricCard label="Past due accounts" value={String(data?.financialVolume?.pastDueAccounts ?? 0)} hint="Need billing recovery" tone="warning" />
        </MetricGrid>
      )}

      {tab === 'adoption' && (
        <MetricGrid>
          <MetricCard label="Challan PDFs today" value={String(data?.featureAdoption?.challanPdfsToday ?? 0)} hint="Dispatch paperwork generated today" tone="brand" />
          <MetricCard label="Reminders sent today" value={String(data?.featureAdoption?.remindersSentToday ?? 0)} hint="WhatsApp reminders delivered successfully" tone="success" />
          <MetricCard label="Businesses on Pro" value={String(data?.featureAdoption?.businessesOnPro ?? 0)} hint="Paid feature adoption" tone="info" />
          <MetricCard label="Businesses in Trial" value={String(data?.featureAdoption?.businessesInTrial ?? 0)} hint="Activation pipeline" tone="default" />
        </MetricGrid>
      )}

      <Card className="mt-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Why this layout works</div>
        <div className="mt-3 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          For 1,000+ users or businesses, one giant screen becomes slow to scan and slow to operate. This tabbed metrics view keeps overview signals separate from paginated record management, which is the safer pattern for long-term admin scaling.
        </div>
      </Card>
    </SuperAdminShell>
  )
}
