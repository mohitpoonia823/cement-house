'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useLedger, useLedgerSummary, useRecordPayment } from '@/hooks/useLedger'
import { fmt, fmtDate } from '@/lib/utils'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const PAYMENT_MODES = ['CASH', 'UPI', 'CHEQUE']

export default function KhataPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <KhataContent />
    </Suspense>
  )
}

function KhataContent() {
  const params = useSearchParams()
  const initId = params.get('customer') ?? ''
  const [selectedId, setSelectedId] = useState(initId)
  const [search, setSearch] = useState('')
  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('CASH')
  const [payRef, setPayRef] = useState('')
  const [payError, setPayError] = useState('')

  const { data: summary, isLoading: sLoading } = useLedgerSummary()
  const { data: ledger, isLoading: lLoading } = useLedger(selectedId)
  const recordPayment = useRecordPayment()

  const filtered = (summary ?? []).filter((c: any) => c.customerName.toLowerCase().includes(search.toLowerCase()))
  const selected = (summary ?? []).find((c: any) => c.customerId === selectedId)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setPayError('')
    try {
      await recordPayment.mutateAsync({
        customerId: selectedId,
        amount: Number(payAmount),
        paymentMode: payMode,
        reference: payRef || undefined,
      })
      setShowPayForm(false)
      setPayAmount('')
      setPayRef('')
    } catch (err: any) {
      setPayError(err.response?.data?.error ?? 'Failed to record payment')
    }
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Collection analytics"
        title="Khata and collections"
        description="Focus collections on the right parties with a clear balance view, searchable ledger, and fast payment capture."
      />

      <MetricGrid className="mb-6">
        <MetricCard label="Customers with dues" value={String((summary ?? []).filter((c: any) => c.balance > 0).length)} hint="Accounts needing follow-up" tone="warning" />
        <MetricCard label="Open balance" value={fmt((summary ?? []).reduce((sum: number, c: any) => sum + Math.max(0, Number(c.balance)), 0))} hint="Net receivables across the ledger" tone="danger" />
        <MetricCard label="Search results" value={String(filtered.length)} hint="Filtered customer list" />
        <MetricCard label="Selected account" value={selected?.customerName ?? 'None'} hint={selected ? `Current balance ${fmt(Math.abs(selected.balance ?? 0))}` : 'Pick a party to review entries'} tone="brand" />
      </MetricGrid>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Card className="flex min-h-[520px] flex-col">
            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                Party ledger
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">Customer balances</div>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search party..."
              className="mb-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />

            <div className="flex-1 overflow-y-auto">
              {sLoading ? (
                <PageLoader />
              ) : filtered.length === 0 ? (
                <EmptyState title="No dues" sub="All accounts are clear" />
              ) : (
                filtered.map((c: any) => (
                  <button
                    key={c.customerId}
                    onClick={() => setSelectedId(c.customerId)}
                    className={`mb-2 w-full rounded-2xl px-4 py-3 text-left transition-colors ${
                      selectedId === c.customerId
                        ? 'bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] dark:bg-sky-500 dark:text-slate-950'
                        : 'border border-slate-200/80 bg-white/70 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${selectedId === c.customerId ? 'text-inherit' : 'text-slate-900 dark:text-slate-100'}`}>
                      {c.customerName}
                    </div>
                    <div
                      className={`mt-1 text-xs font-medium ${
                        selectedId === c.customerId
                          ? 'text-inherit/80'
                          : c.balance > 50000
                            ? 'text-red-600'
                            : c.balance > 0
                              ? 'text-amber-600'
                              : 'text-green-600'
                      }`}
                    >
                      {fmt(c.balance)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0">
          {!selectedId ? (
            <Card className="flex min-h-[520px] items-center justify-center">
              <EmptyState title="Select a party" sub="Choose a customer from the left to view their khata" />
            </Card>
          ) : (
            <Card className="flex min-h-[520px] flex-col">
              <div className="mb-4 flex flex-col gap-3 border-b border-stone-100 pb-3 dark:border-stone-800 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-medium text-stone-900 dark:text-stone-100">{selected?.customerName}</div>
                  <div className={`mt-0.5 text-sm font-medium ${(selected?.balance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(selected?.balance ?? 0) > 0 ? 'Outstanding: ' : 'No dues - '}
                    {fmt(Math.abs(selected?.balance ?? 0))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowPayForm(true)}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    + Record payment
                  </button>
                  <button
                    className="rounded-md border border-stone-200 px-3 py-1.5 text-xs hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
                    onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_URL}/api/ledger/${selectedId}/statement`, '_blank')}
                  >
                    Download statement PDF
                  </button>
                </div>
              </div>

              {showPayForm && (
                <form
                  onSubmit={handlePay}
                  className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950"
                >
                  <div className="mb-2 text-xs font-medium text-green-800 dark:text-green-200">Record payment</div>
                  <div className="mb-2 flex gap-2">
                    {PAYMENT_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMode(m)}
                        className={`rounded-full border px-2 py-1 text-[10px] transition-colors ${
                          payMode === m ? 'border-green-600 bg-green-600 text-white' : 'border-green-300 text-green-700'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="number"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="Amount (INR)"
                      min={1}
                      required
                      className="flex-1 rounded-lg border border-green-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 dark:bg-stone-800 dark:text-stone-100"
                    />
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="Ref / cheque no (optional)"
                      className="flex-1 rounded-lg border border-green-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 dark:bg-stone-800 dark:text-stone-100"
                    />
                    <button
                      type="submit"
                      disabled={recordPayment.isPending}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPayForm(false)}
                      className="px-2 py-1.5 text-xs text-stone-500 hover:text-stone-700"
                    >
                      Cancel
                    </button>
                  </div>
                  {payError && <div className="mt-1 text-[10px] text-red-600">{payError}</div>}
                </form>
              )}

              {lLoading ? (
                <PageLoader />
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-xs">
                    <thead className="sticky top-0 bg-white dark:bg-stone-900">
                      <tr className="border-b border-stone-100 dark:border-stone-800">
                        {['Date', 'Description', 'Debit (sale)', 'Credit (paid)', 'Balance'].map((h) => (
                          <th key={h} className="py-2 pr-4 text-left font-normal text-stone-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(ledger?.entries ?? []).map((e: any) => (
                        <tr key={e.id} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                          <td className="py-2 pr-4 text-stone-500">{fmtDate(e.createdAt)}</td>
                          <td className="py-2 pr-4 text-stone-700 dark:text-stone-300">
                            {e.notes ?? (e.order ? `Order ${e.order.orderNumber}` : e.type)}
                            {e.reference && <span className="text-stone-400"> - {e.reference}</span>}
                          </td>
                          <td className="py-2 pr-4 font-medium text-red-600 dark:text-red-400">
                            {e.type === 'DEBIT' ? fmt(Number(e.amount)) : '-'}
                          </td>
                          <td className="py-2 pr-4 font-medium text-green-700 dark:text-green-400">
                            {e.type === 'CREDIT' ? fmt(Number(e.amount)) : '-'}
                          </td>
                          <td className={`py-2 font-medium ${e.runningBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-500'}`}>
                            {e.runningBalance > 0 ? `-${fmt(e.runningBalance)}` : 'Clear'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {ledger?.currentBalance > 0 && (
                      <tfoot>
                        <tr className="bg-stone-50 dark:bg-stone-800">
                          <td colSpan={4} className="py-2 pr-4 text-xs font-medium text-stone-600 dark:text-stone-300">
                            Current outstanding
                          </td>
                          <td className="py-2 text-sm font-medium text-red-600 dark:text-red-400">{fmt(ledger.currentBalance)}</td>
                        </tr>
                      </tfoot>
                    )}
                    </table>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  )
}
