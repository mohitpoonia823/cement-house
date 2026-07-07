'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDayBook, useTrialBalance, useBackfillLedger, useAccountLedger, useReconciliation } from '@/hooks/useAccounting'
import { fmt, fmtDate } from '@/lib/utils'
import { downloadCsv } from '@/lib/csv'
import { Fragment, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'

const VOUCHER_TONE: Record<string, string> = {
  PURCHASE: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  PAYMENT: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  RECEIPT: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  OPENING: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  JOURNAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  EXPENSE: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  CONTRA: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  SALE: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
}

export default function BooksPage() {
  const { language } = useI18n()
  const t = (en: string, hi: string) => (language === 'hi' ? hi : en)
  const [tab, setTab] = useState<'daybook' | 'trial' | 'recon'>('daybook')
  const [dayFrom, setDayFrom] = useState('')
  const [dayTo, setDayTo] = useState('')
  const [dayOffset, setDayOffset] = useState(0)
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null)
  const PAGE = 25

  const dayParams = useMemo(() => ({
    startDate: dayFrom ? new Date(dayFrom + 'T00:00:00').toISOString() : undefined,
    endDate: dayTo ? new Date(dayTo + 'T23:59:59').toISOString() : undefined,
    limit: PAGE,
    offset: dayOffset,
  }), [dayFrom, dayTo, dayOffset])

  const { data: dayBook, isLoading: dbLoading, isFetching: dbFetching } = useDayBook(dayParams)
  const { data: trial, isLoading: tbLoading } = useTrialBalance()
  const { data: recon, isLoading: reconLoading } = useReconciliation()
  const { data: accountLedger, isLoading: alLoading } = useAccountLedger(ledgerAccountId)
  const backfill = useBackfillLedger()
  const [backfillMsg, setBackfillMsg] = useState('')

  const dayItems = dayBook?.items ?? []
  function changeRange(from: string, to: string) { setDayFrom(from); setDayTo(to); setDayOffset(0) }

  function handleExport() {
    const today = new Date().toISOString().slice(0, 10)
    if (tab === 'trial' && trial) {
      const rows: (string | number)[][] = [
        ['Trial Balance', today],
        [],
        ['Account', 'Group', 'Debit', 'Credit'],
        ...(trial.rows ?? []).map((r: any) => [r.name, r.group, r.debit, r.credit]),
        ['Total', '', trial.totalDebit, trial.totalCredit],
      ]
      downloadCsv(`trial-balance-${today}`, rows)
    } else if (tab === 'daybook' && dayItems.length) {
      const rows: (string | number)[][] = [
        ['Day Book', today],
        [],
        ['Date', 'Voucher', 'Type', 'Account', 'Debit', 'Credit', 'Narration'],
      ]
      for (const v of dayItems) {
        v.lines.forEach((l: any, i: number) => {
          rows.push([
            i === 0 ? fmtDate(v.date) : '', i === 0 ? v.voucherNumber : '', i === 0 ? v.voucherType : '',
            l.accountName, l.debit || '', l.credit || '', i === 0 ? (v.narration ?? '') : '',
          ])
        })
      }
      downloadCsv(`day-book-${today}`, rows)
    }
  }

  async function handleBackfill() {
    setBackfillMsg('')
    try {
      const res = await backfill.mutateAsync()
      setBackfillMsg(t(`Imported ${res.salesPosted} sales and ${res.receiptsPosted} receipts.`, `${res.salesPosted} बिक्री और ${res.receiptsPosted} प्राप्तियाँ इम्पोर्ट हुईं।`))
    } catch (err: any) {
      setBackfillMsg(err.response?.data?.error ?? 'Import failed')
    }
  }

  const grouped = useMemo(() => {
    const rows = trial?.rows ?? []
    const map = new Map<string, any[]>()
    for (const r of rows) {
      if (!map.has(r.group)) map.set(r.group, [])
      map.get(r.group)!.push(r)
    }
    return Array.from(map.entries())
  }, [trial])

  return (
    <AppShell>
      <div className="hidden md:block">
        <SectionHeader
          eyebrow={t('Accounting books', 'लेखा बही')}
          title={t('Day book and trial balance', 'डे बुक और ट्रायल बैलेंस')}
          description={t(
            'Every voucher your business posts, and a running trial balance that always ties out to the rupee.',
            'आपके व्यवसाय द्वारा पोस्ट किया गया हर वाउचर, और एक ट्रायल बैलेंस जो हमेशा रुपये तक मिलता है।',
          )}
        />
      </div>
      <div className="mb-4 md:hidden">
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{t('Books', 'बही')}</h1>
      </div>

      <MetricGrid className="mb-6">
        <MetricCard label={t('Total debit', 'कुल डेबिट')} value={tbLoading ? '—' : fmt(trial?.totalDebit ?? 0)} hint={t('Sum of all debit balances', 'सभी डेबिट बैलेंस का योग')} tone="brand" />
        <MetricCard label={t('Total credit', 'कुल क्रेडिट')} value={tbLoading ? '—' : fmt(trial?.totalCredit ?? 0)} hint={t('Sum of all credit balances', 'सभी क्रेडिट बैलेंस का योग')} tone="brand" />
        <MetricCard label={t('Status', 'स्थिति')} value={tbLoading ? '—' : trial?.balanced ? t('Balanced', 'संतुलित') : t('Check', 'जाँचें')} hint={t('Debit must equal credit', 'डेबिट क्रेडिट के बराबर होना चाहिए')} tone={trial?.balanced ? 'success' : 'danger'} />
        <MetricCard label={t('Vouchers', 'वाउचर')} value={dbLoading ? '—' : String(dayBook?.total ?? 0)} hint={t('Total postings in range', 'रेंज में कुल पोस्टिंग')} />
      </MetricGrid>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('daybook')} className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'daybook' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{t('Day book', 'डे बुक')}</button>
        <button onClick={() => setTab('trial')} className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'trial' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{t('Trial balance', 'ट्रायल बैलेंस')}</button>
        <button onClick={() => setTab('recon')} className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${tab === 'recon' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
          {t('Reconciliation', 'मिलान')}
          {recon && !recon.reconciled ? <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">{recon.mismatchCount}</span> : null}
        </button>
        <button
          onClick={handleBackfill}
          disabled={backfill.isPending}
          title={t('Import past sales & receipts into the ledger', 'पुरानी बिक्री और प्राप्तियाँ लेजर में इम्पोर्ट करें')}
          className="ml-auto rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {backfill.isPending ? t('Importing...', 'इम्पोर्ट हो रहा है...') : t('Import history', 'इतिहास इम्पोर्ट करें')}
        </button>
        <button onClick={handleExport} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          {t('Download CSV', 'CSV डाउनलोड करें')}
        </button>
      </div>
      {backfillMsg && <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">{backfillMsg}</div>}

      {tab === 'recon' && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('Khata vs books (customer balances)', 'खाता बनाम बही (ग्राहक बैलेंस)')}</div>
            {!reconLoading && recon && (
              <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${recon.reconciled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                {recon.reconciled ? t('Fully reconciled', 'पूरी तरह मिलान') : t(`${recon.mismatchCount} customers differ`, `${recon.mismatchCount} ग्राहकों में अंतर`)}
              </span>
            )}
          </div>
          {reconLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 rounded-lg bg-slate-50 dark:bg-slate-800/50" />)}</div>
          ) : !recon ? (
            <EmptyState title={t('No data', 'कोई डेटा नहीं')} sub="" />
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-stone-100 p-2 dark:border-slate-800">
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('Khata total', 'खाता कुल')}</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(recon.totalKhata)}</div>
                </div>
                <div className="rounded-lg border border-stone-100 p-2 dark:border-slate-800">
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('Books total', 'बही कुल')}</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(recon.totalJournal)}</div>
                </div>
                <div className="rounded-lg border border-stone-100 p-2 dark:border-slate-800">
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('Difference', 'अंतर')}</div>
                  <div className={`text-sm font-semibold ${Math.abs(recon.totalDiff) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(recon.totalDiff)}</div>
                </div>
              </div>
              {recon.reconciled ? (
                <EmptyState title={t('Khata and books agree for every customer', 'हर ग्राहक के लिए खाता और बही मिलते हैं')} sub={t(`${recon.customerCount} customers checked`, `${recon.customerCount} ग्राहक जाँचे गए`)} />
              ) : (
                <>
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {t(
                      'Differences usually mean old sales/receipts were never imported into the books — run "Import history" above, then re-check.',
                      'अंतर का मतलब आमतौर पर पुरानी बिक्री/प्राप्तियाँ बही में इम्पोर्ट नहीं हुईं — ऊपर "इतिहास इम्पोर्ट करें" चलाएँ, फिर दोबारा जाँचें।',
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-400 dark:border-stone-700 dark:text-slate-300">
                          <th className="py-2 pr-4 text-left font-normal">{t('Customer', 'ग्राहक')}</th>
                          <th className="py-2 pr-4 text-right font-normal">{t('Khata', 'खाता')}</th>
                          <th className="py-2 pr-4 text-right font-normal">{t('Books', 'बही')}</th>
                          <th className="py-2 text-right font-normal">{t('Difference', 'अंतर')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recon.mismatches.map((r: any) => (
                          <tr key={r.customerId} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                            <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">{r.customerName}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{fmt(r.khata)}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{fmt(r.journal)}</td>
                            <td className="py-2 text-right font-medium tabular-nums text-red-600 dark:text-red-400">{fmt(r.diff)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
      )}

      {tab === 'daybook' && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('From', 'से')}</span>
            <input type="date" value={dayFrom} onChange={(e) => changeRange(e.target.value, dayTo)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('To', 'तक')}</span>
            <input type="date" value={dayTo} onChange={(e) => changeRange(dayFrom, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
            {(dayFrom || dayTo) && <button onClick={() => changeRange('', '')} className="text-[11px] text-sky-600 hover:underline">{t('Clear', 'हटाएँ')}</button>}
            <span className="ml-auto text-[11px] text-slate-400">{dbFetching ? t('Loading...', 'लोड हो रहा है...') : t(`${dayBook?.total ?? 0} vouchers`, `${dayBook?.total ?? 0} वाउचर`)}</span>
          </div>
          {dbLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-50 dark:bg-slate-800/50" />)}</div>
          ) : dayItems.length === 0 ? (
            <EmptyState title={t('No vouchers', 'कोई वाउचर नहीं')} sub={t('Nothing posted in this period', 'इस अवधि में कुछ पोस्ट नहीं हुआ')} />
          ) : (
            <div className="space-y-3">
              {dayItems.map((v: any) => (
                <div key={v.id} className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${VOUCHER_TONE[v.voucherType] ?? 'bg-slate-100 text-slate-600'}`}>{v.voucherType}</span>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{v.voucherNumber}</span>
                      <span className="text-[11px] text-slate-400">{fmtDate(v.date)}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{fmt(v.amount)}</span>
                  </div>
                  {v.narration && <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">{v.narration}{v.reference ? ` · ${v.reference}` : ''}</div>}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[440px] text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-100 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                          <th className="py-1 pr-4 text-left font-semibold">{t('Particulars', 'विवरण')}</th>
                          <th className="w-28 py-1 pr-4 text-right font-semibold">{t('Debit', 'डेबिट')}</th>
                          <th className="w-28 py-1 text-right font-semibold">{t('Credit', 'क्रेडिट')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...v.lines].sort((a: any, b: any) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0)).map((l: any, i: number) => {
                          const isDebit = l.debit > 0
                          return (
                            <tr key={i} className="border-t border-slate-50 first:border-0 dark:border-slate-800/60">
                              <td className={`py-1 pr-4 ${isDebit ? 'text-slate-800 dark:text-slate-100' : 'pl-5 text-slate-600 dark:text-slate-300'}`}>
                                <span className="mr-1 text-[9px] font-semibold text-slate-400">{isDebit ? t('Dr', 'ड') : t('To', 'को')}</span>
                                <button type="button" onClick={() => setLedgerAccountId(l.accountId)} className="hover:text-sky-600 hover:underline dark:hover:text-sky-400">{l.accountName}</button>
                              </td>
                              <td className="w-28 py-1 pr-4 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{isDebit ? fmt(l.debit) : ''}</td>
                              <td className="w-28 py-1 text-right font-medium tabular-nums text-slate-700 dark:text-slate-300">{!isDebit ? fmt(l.credit) : ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {(dayBook?.total ?? 0) > PAGE && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <button disabled={dayOffset === 0} onClick={() => setDayOffset(Math.max(0, dayOffset - PAGE))} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">{t('Previous', 'पिछला')}</button>
                  <span className="text-slate-400">{dayOffset + 1}–{Math.min(dayOffset + PAGE, dayBook?.total ?? 0)} {t('of', 'में से')} {dayBook?.total ?? 0}</span>
                  <button disabled={!dayBook?.hasMore} onClick={() => setDayOffset(dayOffset + PAGE)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">{t('Next', 'अगला')}</button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === 'trial' && (
        <Card>
          {tbLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 rounded-lg bg-slate-50 dark:bg-slate-800/50" />)}</div>
          ) : (trial?.rows ?? []).length === 0 ? (
            <EmptyState title={t('Nothing to show', 'दिखाने के लिए कुछ नहीं')} sub={t('Post a purchase or opening balance to build the trial balance', 'ट्रायल बैलेंस बनाने के लिए खरीद या शुरुआती बैलेंस पोस्ट करें')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-700">
                    <th className="py-2 pr-4 text-left font-normal text-stone-400 dark:text-slate-300">{t('Account', 'खाता')}</th>
                    <th className="py-2 pr-4 text-right font-normal text-stone-400 dark:text-slate-300">{t('Debit', 'डेबिट')}</th>
                    <th className="py-2 text-right font-normal text-stone-400 dark:text-slate-300">{t('Credit', 'क्रेडिट')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([group, rows]) => (
                    <Fragment key={group}>
                      <tr className="bg-slate-50 dark:bg-slate-800/50">
                        <td colSpan={3} className="py-1.5 pr-4 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group}</td>
                      </tr>
                      {rows.map((r: any) => (
                        <tr key={r.accountId} onClick={() => setLedgerAccountId(r.accountId)} className="cursor-pointer border-b border-stone-50 last:border-0 hover:bg-slate-50 dark:border-stone-800 dark:hover:bg-slate-800/40">
                          <td className="py-2 pr-4 text-stone-700 hover:text-sky-600 dark:text-slate-200 dark:hover:text-sky-400">{r.name}</td>
                          <td className="py-2 pr-4 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{r.debit > 0 ? fmt(r.debit) : '-'}</td>
                          <td className="py-2 text-right font-medium tabular-nums text-slate-600 dark:text-slate-300">{r.credit > 0 ? fmt(r.credit) : '-'}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stone-300 dark:border-slate-600">
                    <td className="py-2 pr-4 text-xs font-semibold text-stone-700 dark:text-slate-200">{t('Total', 'कुल')}</td>
                    <td className="py-2 pr-4 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(trial?.totalDebit ?? 0)}</td>
                    <td className="py-2 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(trial?.totalCredit ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
              {!trial?.balanced && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {t('Debit and credit do not match — please review recent vouchers.', 'डेबिट और क्रेडिट मेल नहीं खाते — कृपया हाल के वाउचर जाँचें।')}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {ledgerAccountId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={() => setLedgerAccountId(null)}>
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{accountLedger?.account?.name ?? t('Account ledger', 'खाता बही')}</div>
                {accountLedger?.account && <div className="text-[11px] text-slate-400">{accountLedger.account.group} · {accountLedger.account.type}</div>}
              </div>
              <button onClick={() => setLedgerAccountId(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">✕</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {alLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 rounded bg-slate-50 dark:bg-slate-800/50" />)}</div>
              ) : (accountLedger?.entries ?? []).length === 0 ? (
                <EmptyState title={t('No entries', 'कोई एंट्री नहीं')} sub="" />
              ) : (
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                      <th className="py-2 pr-3 text-left font-semibold">{t('Date', 'तारीख')}</th>
                      <th className="py-2 pr-3 text-left font-semibold">{t('Voucher', 'वाउचर')}</th>
                      <th className="py-2 pr-3 text-left font-semibold">{t('Particulars', 'विवरण')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('Debit', 'डेबिट')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('Credit', 'क्रेडिट')}</th>
                      <th className="py-2 text-right font-semibold">{t('Balance', 'बैलेंस')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(accountLedger?.entries ?? []).map((e: any) => (
                      <tr key={e.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                        <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-300">{fmtDate(e.date)}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{e.voucherNumber}</td>
                        <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{e.narration ?? e.voucherType}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{e.debit > 0 ? fmt(e.debit) : ''}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{e.credit > 0 ? fmt(e.credit) : ''}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{fmt(Math.abs(e.balance))} {accountLedger?.account?.debitNormal ? (e.balance >= 0 ? 'Dr' : 'Cr') : (e.balance >= 0 ? 'Cr' : 'Dr')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-600">
                      <td colSpan={3} className="py-2 pr-3 text-slate-700 dark:text-slate-200">{t('Closing balance', 'समापन शेष')}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(accountLedger?.totalDebit ?? 0)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(accountLedger?.totalCredit ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(Math.abs(accountLedger?.closingBalance ?? 0))} {accountLedger?.account?.debitNormal ? ((accountLedger?.closingBalance ?? 0) >= 0 ? 'Dr' : 'Cr') : ((accountLedger?.closingBalance ?? 0) >= 0 ? 'Cr' : 'Dr')}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
