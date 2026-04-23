'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { useLedger, useLedgerSummary, useRecordPayment } from '@/hooks/useLedger'
import { fmt, fmtDate } from '@/lib/utils'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

const PAYMENT_MODES = ['CASH', 'UPI', 'CHEQUE']

export default function KhataPage() {
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

  const filtered = (summary ?? []).filter((c: any) =>
    c.customerName.toLowerCase().includes(search.toLowerCase()))

  const selected = (summary ?? []).find((c: any) => c.customerId === selectedId)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setPayError('')
    try {
      await recordPayment.mutateAsync({
        customerId: selectedId, amount: Number(payAmount),
        paymentMode: payMode, reference: payRef || undefined,
      })
      setShowPayForm(false); setPayAmount(''); setPayRef('')
    } catch (err: any) {
      setPayError(err.response?.data?.error ?? 'Failed to record payment')
    }
  }

  return (
    <AppShell>
      <div className="flex gap-4 h-full">
        {/* Customer list */}
        <div className="w-56 flex-shrink-0">
          <Card className="h-full flex flex-col">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search party…"
              className="w-full text-xs px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg mb-3 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {sLoading ? <PageLoader /> : filtered.length === 0 ? (
                <EmptyState title="No dues" sub="All accounts are clear" />
              ) : filtered.map((c: any) => (
                <button key={c.customerId} onClick={() => setSelectedId(c.customerId)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedId === c.customerId
                      ? 'bg-blue-50 dark:bg-blue-950'
                      : 'hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}>
                  <div className="text-xs font-medium text-stone-800 dark:text-stone-200">{c.customerName}</div>
                  <div className={`text-[10px] font-medium mt-0.5 ${c.balance > 50000 ? 'text-red-600' : c.balance > 0 ? 'text-amber-600' : 'text-green-600'
                    }`}>{fmt(c.balance)}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Ledger detail */}
        <div className="flex-1 min-w-0">
          {!selectedId ? (
            <Card className="h-full flex items-center justify-center">
              <EmptyState title="Select a party" sub="Choose a customer from the left to view their khata" />
            </Card>
          ) : (
            <Card className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-start justify-between mb-4 pb-3 border-b border-stone-100 dark:border-stone-800">
                <div>
                  <div className="font-medium text-stone-900 dark:text-stone-100">{selected?.customerName}</div>
                  <div className={`text-sm mt-0.5 font-medium ${(selected?.balance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                    {(selected?.balance ?? 0) > 0 ? 'Outstanding: ' : 'No dues — '}
                    {fmt(Math.abs(selected?.balance ?? 0))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowPayForm(true)}
                    className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium">
                    + Record payment
                  </button>
                  <button className="text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-md hover:bg-stone-50 dark:hover:bg-stone-800"
                    onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_URL}/api/ledger/${selectedId}/statement`, "_blank")}>
                    Download statement PDF
                  </button>
                </div>
              </div>

              {/* Payment form inline */}
              {showPayForm && (
                <form onSubmit={handlePay}
                  className="mb-4 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl">
                  <div className="text-xs font-medium text-green-800 dark:text-green-200 mb-2">Record payment</div>
                  <div className="flex gap-2 mb-2">
                    {PAYMENT_MODES.map(m => (
                      <button key={m} type="button" onClick={() => setPayMode(m)}
                        className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${payMode === m ? 'bg-green-600 text-white border-green-600' : 'border-green-300 text-green-700'
                          }`}>{m}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                      placeholder="Amount (₹)" min={1} required
                      className="flex-1 text-xs px-2 py-1.5 border border-green-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 bg-white dark:bg-stone-800 dark:text-stone-100" />
                    <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                      placeholder="Ref / cheque no (optional)"
                      className="flex-1 text-xs px-2 py-1.5 border border-green-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 bg-white dark:bg-stone-800 dark:text-stone-100" />
                    <button type="submit" disabled={recordPayment.isPending}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      Save
                    </button>
                    <button type="button" onClick={() => setShowPayForm(false)}
                      className="text-xs px-2 py-1.5 text-stone-500 hover:text-stone-700">Cancel</button>
                  </div>
                  {payError && <div className="text-[10px] text-red-600 mt-1">{payError}</div>}
                </form>
              )}

              {/* Ledger table */}
              {lLoading ? <PageLoader /> : (
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white dark:bg-stone-900">
                      <tr className="border-b border-stone-100 dark:border-stone-800">
                        {['Date', 'Description', 'Debit (sale)', 'Credit (paid)', 'Balance'].map(h => (
                          <th key={h} className="text-left py-2 pr-4 font-normal text-stone-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(ledger?.entries ?? []).map((e: any) => (
                        <tr key={e.id} className="border-b border-stone-50 dark:border-stone-800 last:border-0">
                          <td className="py-2 pr-4 text-stone-500">{fmtDate(e.createdAt)}</td>
                          <td className="py-2 pr-4 text-stone-700 dark:text-stone-300">
                            {e.notes ?? (e.order ? `Order ${e.order.orderNumber}` : e.type)}
                            {e.reference && <span className="text-stone-400"> · {e.reference}</span>}
                          </td>
                          <td className="py-2 pr-4 font-medium text-red-600 dark:text-red-400">
                            {e.type === 'DEBIT' ? fmt(Number(e.amount)) : '—'}
                          </td>
                          <td className="py-2 pr-4 font-medium text-green-700 dark:text-green-400">
                            {e.type === 'CREDIT' ? fmt(Number(e.amount)) : '—'}
                          </td>
                          <td className={`py-2 font-medium ${e.runningBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-500'
                            }`}>
                            {e.runningBalance > 0 ? `-${fmt(e.runningBalance)}` : '✓ Clear'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {ledger?.currentBalance > 0 && (
                      <tfoot>
                        <tr className="bg-stone-50 dark:bg-stone-800">
                          <td colSpan={4} className="py-2 pr-4 text-xs font-medium text-stone-600 dark:text-stone-300">Current outstanding</td>
                          <td className="py-2 text-sm font-medium text-red-600 dark:text-red-400">{fmt(ledger.currentBalance)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  )
}
