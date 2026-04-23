'use client'
import { AppShell }  from '@/components/layout/AppShell'
import { Card, KpiCard, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useQuery }  from '@tanstack/react-query'
import { api }       from '@/lib/api'
import { fmt }       from '@/lib/utils'
import { useState }  from 'react'

function useMonthlyReport(year: number, month: number) {
  return useQuery({
    queryKey: ['reports', 'monthly', year, month],
    queryFn:  () => api.get('/api/reports/monthly', { params: { year, month } }).then(r => r.data.data),
  })
}

export default function ReportsPage() {
  const now   = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data, isLoading } = useMonthlyReport(year, month)

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Owner analytics"
        title="Business reports"
        description="Monthly performance snapshots for sales, margin quality, and order throughput."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {months.map((m, i) => (
          <button key={m} onClick={() => setMonth(i + 1)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              month === i + 1 ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 bg-white/75 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
            }`}>{m}</button>
        ))}
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="mb-5 grid gap-4 md:grid-cols-3">
            <KpiCard label="Total sales"  value={fmt(data?.totalSales ?? 0)} sub={`${data?.orderCount ?? 0} orders`} />
            <KpiCard label="Avg margin"   value={`${(data?.avgMargin ?? 0).toFixed(1)}%`} />
            <KpiCard label="Orders"       value={String(data?.orderCount ?? 0)} />
          </div>
          <Card>
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-4">
              {months[month - 1]} {year} — summary
            </div>
            {data?.orderCount === 0 ? (
              <div className="text-sm text-stone-400 py-8 text-center">No orders this month</div>
            ) : (
              <div className="text-sm text-stone-600 dark:text-stone-400">
                Total revenue of <strong className="text-stone-900 dark:text-stone-100">{fmt(data?.totalSales)}</strong> across{' '}
                <strong className="text-stone-900 dark:text-stone-100">{data?.orderCount}</strong> orders,
                with an average gross margin of <strong className="text-stone-900 dark:text-stone-100">{(data?.avgMargin ?? 0).toFixed(1)}%</strong>.
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  )
}
