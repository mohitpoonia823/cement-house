'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useTransition } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { Card, KpiCard, SectionHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'

type ReportGranularity = 'monthly' | 'yearly'

function useReportSummary(granularity: ReportGranularity, year: number, month: number) {
  return useQuery({
    queryKey: ['reports', 'summary', granularity, year, month],
    queryFn: () =>
      api
        .get('/api/reports/summary', { params: { granularity, year, month: granularity === 'monthly' ? month : undefined } })
        .then((r) => r.data.data),
  })
}

function useReportHistory() {
  return useQuery({
    queryKey: ['reports', 'history'],
    queryFn: () => api.get('/api/reports/history').then((r) => r.data.data),
  })
}

async function downloadReportExport(input: {
  page: string
  granularity?: string
  year?: number
  month?: number | null
}) {
  const token = window.localStorage.getItem('auth_token')
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const query = new URLSearchParams()
  query.set('page', input.page)
  if (input.granularity) query.set('granularity', input.granularity)
  if (input.year) query.set('year', String(input.year))
  if (input.month) query.set('month', String(input.month))

  const response = await fetch(`${baseUrl}/api/reports/export?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    throw new Error(`Export failed with status ${response.status}`)
  }

  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') ?? undefined
  const filenameMatch = disposition?.match(/filename="([^"]+)"/)
  const filename = filenameMatch?.[1] ?? `${input.page}-snapshot`
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const now = new Date()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const granularity = (searchParams.get('granularity') === 'yearly' ? 'yearly' : 'monthly') as ReportGranularity
  const year = Number(searchParams.get('year') ?? now.getFullYear())
  const month = Number(searchParams.get('month') ?? now.getMonth() + 1)

  const { data, isLoading } = useReportSummary(granularity, year, month)
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useReportHistory()

  const summaryTitle = useMemo(() => {
    if (granularity === 'yearly') return `${year} — summary`
    return `${months[month - 1]} ${year} — summary`
  }, [granularity, year, month])

  function updateParams(next: Partial<{ granularity: ReportGranularity; year: number; month: number }>) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.granularity) params.set('granularity', next.granularity)
    if (next.year) params.set('year', String(next.year))
    if (next.month) params.set('month', String(next.month))
    if ((next.granularity ?? granularity) === 'yearly') params.delete('month')

    startTransition(() => {
      router.replace(`/reports?${params.toString()}`)
    })
  }

  async function handleExportCurrent() {
    await downloadReportExport({
      page: 'reports',
      granularity,
      year,
      month: granularity === 'monthly' ? month : null,
    })
    refetchHistory()
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Owner analytics"
        title="Business reports"
        description="Switch between monthly and yearly views, then review every PDF or CSV you exported anywhere in the workspace."
        action={
          <button
            onClick={handleExportCurrent}
            disabled={isPending}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            Export selected report
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          onClick={() => updateParams({ granularity: 'monthly', month })}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
            granularity === 'monthly'
              ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
              : 'border border-slate-200 bg-white/75 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => updateParams({ granularity: 'yearly' })}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
            granularity === 'yearly'
              ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
              : 'border border-slate-200 bg-white/75 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
          }`}
        >
          Yearly
        </button>

        {granularity === 'monthly' &&
          months.map((m, i) => (
            <button
              key={m}
              onClick={() => updateParams({ month: i + 1 })}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                month === i + 1
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'border border-slate-200 bg-white/75 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300'
              }`}
            >
              {m}
            </button>
          ))}

        <select
          value={year}
          onChange={(e) => updateParams({ year: Number(e.target.value) })}
          className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
        >
          {Array.from({ length: 5 }).map((_, index) => {
            const optionYear = now.getFullYear() - index
            return (
              <option key={optionYear} value={optionYear}>
                {optionYear}
              </option>
            )
          })}
        </select>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          <div className="mb-5 grid gap-4 md:grid-cols-4">
            <KpiCard label="Total sales" value={fmt(data?.totalSales ?? 0)} sub={`${data?.orderCount ?? 0} orders`} />
            <KpiCard label="Avg margin" value={`${(data?.avgMargin ?? 0).toFixed(1)}%`} />
            <KpiCard label="Collected" value={fmt(data?.paidAmount ?? 0)} />
            <KpiCard label="Outstanding" value={fmt(data?.outstanding ?? 0)} />
          </div>

          <Card className="mb-6">
            <div className="mb-4 text-xs font-medium uppercase tracking-wide text-stone-500">{summaryTitle}</div>
            {data?.orderCount === 0 ? (
              <div className="text-sm text-stone-400 py-8 text-center">
                No orders found for this {granularity === 'yearly' ? 'year' : 'month'}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-stone-600 dark:text-stone-400">
                  Total revenue of <strong className="text-stone-900 dark:text-stone-100">{fmt(data?.totalSales ?? 0)}</strong> across{' '}
                  <strong className="text-stone-900 dark:text-stone-100">{data?.orderCount ?? 0}</strong> orders, with an average gross margin of{' '}
                  <strong className="text-stone-900 dark:text-stone-100">{(data?.avgMargin ?? 0).toFixed(1)}%</strong>.
                </div>

                <div className="overflow-hidden rounded-[24px] border border-slate-200/70 dark:border-slate-800">
                  <div className="grid grid-cols-[1.1fr_0.8fr_0.65fr_0.75fr] gap-3 bg-slate-50/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                    <div>Order</div>
                    <div>Customer</div>
                    <div>Status</div>
                    <div>Total</div>
                  </div>
                  {(data?.recentOrders ?? []).map((order: any) => (
                    <div key={order.id} className="grid grid-cols-[1.1fr_0.8fr_0.65fr_0.75fr] gap-3 border-t border-slate-200/70 px-4 py-3 text-sm dark:border-slate-800">
                      <div className="font-semibold text-slate-950 dark:text-white">{order.orderNumber}</div>
                      <div className="text-slate-600 dark:text-slate-300">{order.customerName}</div>
                      <div className="text-slate-500 dark:text-slate-400">{order.status}</div>
                      <div className="font-semibold text-slate-950 dark:text-white">{fmt(order.totalAmount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Export history</div>
                <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Files exported by you across the workspace</div>
              </div>
            </div>

            {historyLoading ? (
              <PageLoader />
            ) : (history?.length ?? 0) === 0 ? (
              <EmptyState
                title="No exports yet"
                sub="PDF and CSV exports from dashboard, reports, orders, customers, inventory, delivery, khata, and settings will appear here."
              />
            ) : (
              <div className="overflow-hidden rounded-[24px] border border-slate-200/70 dark:border-slate-800">
                <div className="grid grid-cols-[1.3fr_0.55fr_1fr_0.9fr_0.8fr] gap-3 bg-slate-50/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <div>Exported report</div>
                  <div>Type</div>
                  <div>Period / scope</div>
                  <div>Exported at</div>
                  <div>Action</div>
                </div>
                {history.map((item: any) => (
                  <div key={item.id} className="grid grid-cols-[1.3fr_0.55fr_1fr_0.9fr_0.8fr] gap-3 border-t border-slate-200/70 px-4 py-3 text-sm dark:border-slate-800">
                    <div>
                      <div className="font-semibold text-slate-950 dark:text-white">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.fileName}</div>
                    </div>
                    <div className="font-medium uppercase text-slate-600 dark:text-slate-300">{item.format}</div>
                    <div className="text-slate-600 dark:text-slate-300">
                      {item.query?.granularity
                        ? `${item.query.granularity === 'yearly' ? 'Yearly' : 'Monthly'} • ${item.query?.year}${item.query?.month ? ` / ${months[item.query.month - 1]}` : ''}`
                        : 'Workspace snapshot'}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">{fmtDate(item.exportedAt)}</div>
                    <div>
                      <button
                        onClick={() =>
                          downloadReportExport({
                            page: item.report,
                            granularity: item.query?.granularity,
                            year: item.query?.year,
                            month: item.query?.month ?? null,
                          })
                        }
                        className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Export again
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  )
}
