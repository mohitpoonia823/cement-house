'use client'
import { useState } from 'react'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Badge } from '@/components/ui/Badge'
import { Card, SectionHeader } from '@/components/ui/Card'
import { fmt, fmtDate } from '@/lib/utils'
import { useAdminPayments, useAdminWebhooks } from '@/lib/super-admin'

const PAGE_SIZE = 15

export default function SuperAdminBillingPage() {
  const [paymentStatus, setPaymentStatus] = useState<'' | 'SUCCESS' | 'FAILED' | 'PENDING'>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [paymentsPage, setPaymentsPage] = useState(1)
  const [webhooksPage, setWebhooksPage] = useState(1)

  const payments = useAdminPayments({ status: paymentStatus, startDate, endDate, page: paymentsPage, pageSize: PAGE_SIZE })
  const webhooks = useAdminWebhooks({ page: webhooksPage, pageSize: PAGE_SIZE })

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Billing operations"
        title="Payments & webhooks"
        description="Every subscription payment across the platform and the Razorpay webhook trail behind them, server-paginated."
      />

      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Subscription payments</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value as typeof paymentStatus)
                setPaymentsPage(1)
              }}
              className={filterCls}
            >
              <option value="">All status</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="PENDING">PENDING</option>
            </select>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPaymentsPage(1) }} className={filterCls} />
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPaymentsPage(1) }} className={filterCls} />
          </div>
        </div>

        {payments.isLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Business</th>
                    <th className="px-3 py-2 text-left">Plan</th>
                    <th className="px-3 py-2 text-left">Amount</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Payment ID</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments.data?.items ?? []).map((row) => (
                    <tr key={row.paymentId} className="border-t border-slate-200/70 dark:border-slate-800">
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{row.businessName ?? row.businessId.slice(0, 8)}</td>
                      <td className="px-3 py-2">{row.planName}</td>
                      <td className="px-3 py-2">{fmt(row.amount)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.status === 'SUCCESS' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'}>{row.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{fmtDate(row.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-400">{row.paymentId.slice(0, 12)}…</td>
                    </tr>
                  ))}
                  {(payments.data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">No payments match these filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager
              page={payments.data?.page ?? 1}
              totalPages={payments.data?.totalPages ?? 1}
              total={payments.data?.total ?? 0}
              onPage={setPaymentsPage}
            />
          </>
        )}
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Razorpay webhook events</div>
        {webhooks.isLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Event</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Received</th>
                    <th className="px-3 py-2 text-left">Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {(webhooks.data?.items ?? []).map((row) => (
                    <tr key={row.eventId} className="border-t border-slate-200/70 dark:border-slate-800">
                      <td className="px-3 py-2 text-slate-400">{row.eventId.slice(0, 16)}…</td>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{row.eventType}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.status === 'PROCESSED' ? 'success' : 'warning'}>{row.status}</Badge>
                      </td>
                      <td className="px-3 py-2">{fmtDate(row.createdAt)}</td>
                      <td className="px-3 py-2">{row.processedAt ? fmtDate(row.processedAt) : '—'}</td>
                    </tr>
                  ))}
                  {(webhooks.data?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-400">No webhook events recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager
              page={webhooks.data?.page ?? 1}
              totalPages={webhooks.data?.totalPages ?? 1}
              total={webhooks.data?.total ?? 0}
              onPage={setWebhooksPage}
            />
          </>
        )}
      </Card>
    </SuperAdminShell>
  )
}

function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
      <span>
        Page {page} of {totalPages} • {total} records
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Next
        </button>
      </div>
    </div>
  )
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  )
}

const filterCls =
  'rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
