'use client'
import Link from 'next/link'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Badge } from '@/components/ui/Badge'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { fmt, fmtDate } from '@/lib/utils'
import { useSuperAdminOverview } from '@/lib/super-admin'

export default function SuperAdminOverviewPage() {
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
      </MetricGrid>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Feature adoption</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Signals that matter to growth and retention</div>
            </div>
            <Link href="/super-admin/metrics" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              View all metrics
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InsightTile label="Challan PDFs" value={String(data?.featureAdoption?.challanPdfsToday ?? 0)} sub="Generated today" />
            <InsightTile label="WhatsApp reminders" value={String(data?.featureAdoption?.remindersSentToday ?? 0)} sub="Successfully sent today" />
            <InsightTile label="Pro businesses" value={String(data?.featureAdoption?.businessesOnPro ?? 0)} sub="Paid expansion accounts" />
            <InsightTile label="Trial businesses" value={String(data?.featureAdoption?.businessesInTrial ?? 0)} sub="Activation pipeline" />
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Activity feed</div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Recent platform actions and warnings</div>
            </div>
            <Badge variant="info">Live</Badge>
          </div>
          <div className="space-y-3">
            {(data?.activityFeed ?? []).map((item: any) => (
              <div key={`${item.kind}-${item.id}`} className="rounded-[22px] border border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950 dark:text-white">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</div>
                  </div>
                  <Badge variant={item.kind === 'ERROR' ? 'danger' : 'default'}>{item.kind}</Badge>
                </div>
                <div className="mt-3 text-xs text-slate-400 dark:text-slate-500">{fmtDate(item.createdAt)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

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

function InsightTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
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
