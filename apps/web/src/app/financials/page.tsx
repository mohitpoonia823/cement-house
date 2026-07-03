'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useProfitLoss, useBalanceSheet, usePayablesAging } from '@/hooks/useAccounting'
import { fmt } from '@/lib/utils'
import { downloadCsv } from '@/lib/csv'
import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'

function monthToPeriod(month: string) {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 0, 23, 59, 59, 999)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function FinancialsPage() {
  const { language } = useI18n()
  const t = (en: string, hi: string) => (language === 'hi' ? hi : en)
  const [tab, setTab] = useState<'pl' | 'bs' | 'aging'>('pl')
  const [month, setMonth] = useState(currentMonth())
  const period = useMemo(() => monthToPeriod(month), [month])

  const { data: pl, isLoading: plLoading } = useProfitLoss(period)
  const { data: bs, isLoading: bsLoading } = useBalanceSheet()
  const { data: aging, isLoading: agingLoading } = usePayablesAging()

  function handleExport() {
    const today = new Date().toISOString().slice(0, 10)
    if (tab === 'pl' && pl) {
      const rows: (string | number)[][] = [
        ['Profit & Loss', month],
        [],
        ['Net sales (ex-GST)', pl.netSales],
        ['Sales returns', -pl.salesReturns],
        ['Cost of goods sold', -pl.cogs],
        ['Gross profit', pl.grossProfit],
        ['Other charges recovered', pl.otherCharges],
        [],
        ['Operating expenses', ''],
        ...pl.expenses.map((e: any) => [e.name, -e.amount]),
        ['Total expenses', -pl.totalExpenses],
        [],
        ['Net profit', pl.netProfit],
        ['Gross margin %', pl.grossMarginPct],
        ['Net margin %', pl.netMarginPct],
        ['GST collected (pass-through)', pl.gstCollected],
      ]
      downloadCsv(`profit-loss-${month}`, rows)
    } else if (tab === 'bs' && bs) {
      const rows: (string | number)[][] = [
        ['Balance Sheet', today],
        [],
        ['Assets', ''],
        ...bs.assets.map((a: any) => [a.name, a.amount]),
        ['Total assets', bs.totalAssets],
        [],
        ['Liabilities & equity', ''],
        ...bs.liabilities.map((l: any) => [l.name, l.amount]),
        ...bs.equity.map((e: any) => [e.name, e.amount]),
        ['Total liabilities & equity', round(bs.totalLiabilities, bs.netWorth)],
      ]
      downloadCsv(`balance-sheet-${today}`, rows)
    } else if (tab === 'aging' && aging) {
      const rows: (string | number)[][] = [
        ['Payables Aging', today],
        [],
        ['Supplier', '0-30', '31-60', '61-90', '90+', 'Total'],
        ...aging.suppliers.map((s: any) => [s.name, s.current, s.days31to60, s.days61to90, s.days90plus, s.total]),
        ['Total', aging.totals.current, aging.totals.days31to60, aging.totals.days61to90, aging.totals.days90plus, aging.totals.total],
      ]
      downloadCsv(`payables-aging-${today}`, rows)
    }
  }

  const Row = ({ label, value, bold, tone }: { label: string; value: number; bold?: boolean; tone?: 'green' | 'red' }) => (
    <div className={`flex items-center justify-between py-2 ${bold ? 'border-t border-stone-200 dark:border-slate-700' : 'border-b border-stone-50 dark:border-slate-800/60'}`}>
      <span className={`text-xs ${bold ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-stone-600 dark:text-slate-300'}`}>{label}</span>
      <span className={`text-xs tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${tone === 'green' ? 'text-green-600 dark:text-green-400' : tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>{fmt(value)}</span>
    </div>
  )

  return (
    <AppShell>
      <div className="hidden md:block">
        <SectionHeader
          eyebrow={t('Financial statements', 'वित्तीय विवरण')}
          title={t('Profit & loss, balance sheet, aging', 'लाभ-हानि, बैलेंस शीट, एजिंग')}
          description={t('Perpetual-inventory basis: revenue is net of GST, cost is COGS from each sale.', 'परपेचुअल-इन्वेंट्री आधार: राजस्व GST-रहित, लागत हर बिक्री की COGS।')}
        />
      </div>
      <div className="mb-4 md:hidden"><h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{t('Financials', 'वित्तीय')}</h1></div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setTab('pl')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === 'pl' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{t('Profit & loss', 'लाभ-हानि')}</button>
        <button onClick={() => setTab('bs')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === 'bs' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{t('Balance sheet', 'बैलेंस शीट')}</button>
        <button onClick={() => setTab('aging')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === 'aging' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{t('Payables aging', 'देय एजिंग')}</button>
        {tab === 'pl' && (
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
        )}
        <button onClick={handleExport} className={`rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 ${tab === 'pl' ? '' : 'ml-auto'}`}>
          {t('Download CSV', 'CSV डाउनलोड करें')}
        </button>
      </div>

      {tab === 'pl' && (
        <>
          <MetricGrid className="mb-6">
            <MetricCard label={t('Net sales', 'शुद्ध बिक्री')} value={plLoading ? '—' : fmt(pl?.netSales ?? 0)} hint={t('Ex-GST, after returns', 'GST-रहित, रिटर्न के बाद')} tone="brand" />
            <MetricCard label={t('Gross profit', 'सकल लाभ')} value={plLoading ? '—' : fmt(pl?.grossProfit ?? 0)} hint={`${pl?.grossMarginPct ?? 0}% ${t('margin', 'मार्जिन')}`} tone="success" />
            <MetricCard label={t('Expenses', 'खर्च')} value={plLoading ? '—' : fmt(pl?.totalExpenses ?? 0)} hint={t('Operating expenses', 'परिचालन खर्च')} tone="warning" />
            <MetricCard label={t('Net profit', 'शुद्ध लाभ')} value={plLoading ? '—' : fmt(pl?.netProfit ?? 0)} hint={`${pl?.netMarginPct ?? 0}% ${t('margin', 'मार्जिन')}`} tone={Number(pl?.netProfit ?? 0) < 0 ? 'danger' : 'success'} />
          </MetricGrid>
          <Card>
            {plLoading ? <div className="h-40 rounded-xl bg-slate-50 dark:bg-slate-800/50" /> : (
              <div className="mx-auto max-w-xl">
                <Row label={t('Net sales', 'शुद्ध बिक्री')} value={pl?.netSales ?? 0} />
                {Number(pl?.salesReturns ?? 0) > 0 && <Row label={t('Less: sales returns', 'घटाएँ: बिक्री रिटर्न')} value={-(pl?.salesReturns ?? 0)} tone="red" />}
                <Row label={t('Less: cost of goods sold', 'घटाएँ: बेचे माल की लागत')} value={-(pl?.cogs ?? 0)} tone="red" />
                <Row label={t('Gross profit', 'सकल लाभ')} value={pl?.grossProfit ?? 0} bold tone={Number(pl?.grossProfit ?? 0) < 0 ? 'red' : 'green'} />
                {Number(pl?.otherCharges ?? 0) > 0 && <Row label={t('Add: transport / loading recovered', 'जोड़ें: ट्रांसपोर्ट / लोडिंग वसूली')} value={pl?.otherCharges ?? 0} tone="green" />}
                <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">{t('Operating expenses', 'परिचालन खर्च')}</div>
                {(pl?.expenses ?? []).length === 0 ? <div className="py-2 text-xs text-stone-400">{t('No expenses recorded', 'कोई खर्च दर्ज नहीं')}</div> : (pl?.expenses ?? []).map((e: any) => <Row key={e.name} label={e.name} value={-e.amount} tone="red" />)}
                <Row label={t('Net profit', 'शुद्ध लाभ')} value={pl?.netProfit ?? 0} bold tone={Number(pl?.netProfit ?? 0) < 0 ? 'red' : 'green'} />
                <div className="mt-3 text-[10px] text-stone-400">{t('GST collected this period (pass-through, not revenue):', 'इस अवधि में एकत्रित GST (पास-थ्रू, राजस्व नहीं):')} {fmt(pl?.gstCollected ?? 0)}</div>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'bs' && (
        <Card>
          {bsLoading ? <div className="h-40 rounded-xl bg-slate-50 dark:bg-slate-800/50" /> : (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('Assets', 'संपत्तियाँ')}</div>
                {(bs?.assets ?? []).map((a: any) => <Row key={a.name} label={a.name} value={a.amount} />)}
                <Row label={t('Total assets', 'कुल संपत्तियाँ')} value={bs?.totalAssets ?? 0} bold />
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('Liabilities & equity', 'देनदारियाँ और पूँजी')}</div>
                {(bs?.liabilities ?? []).map((l: any) => <Row key={l.name} label={l.name} value={l.amount} />)}
                {(bs?.equity ?? []).map((eq: any) => <Row key={eq.name} label={eq.name} value={eq.amount} tone={Number(eq.amount) < 0 ? 'red' : undefined} />)}
                <Row label={t('Total liabilities & equity', 'कुल देनदारियाँ और पूँजी')} value={round(bs?.totalLiabilities, bs?.netWorth)} bold />
              </div>
            </div>
          )}
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
            {t("Equity is shown as net worth (assets − liabilities). Sales and receipts now post to the double-entry ledger — run “Import history” on the Books page once to bring past transactions in.", 'पूँजी नेट वर्थ (संपत्ति − देनदारी) के रूप में दिखाई गई है। बिक्री और प्राप्तियाँ अब डबल-एंट्री लेजर में पोस्ट होती हैं — पुराना डेटा लाने के लिए बुक्स पेज पर एक बार “इतिहास इम्पोर्ट करें” चलाएँ।')}
          </div>
        </Card>
      )}

      {tab === 'aging' && (
        <Card>
          {agingLoading ? <div className="h-40 rounded-xl bg-slate-50 dark:bg-slate-800/50" /> : (aging?.suppliers ?? []).length === 0 ? (
            <EmptyState title={t('No outstanding payables', 'कोई बकाया देय नहीं')} sub={t('Bills you owe will be aged into buckets here', 'आपके देय बिल यहाँ बकेट में दिखेंगे')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-700 text-stone-400 dark:text-slate-300">
                    <th className="py-2 pr-4 text-left font-normal">{t('Supplier', 'सप्लायर')}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t('0–30 days', '0–30 दिन')}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t('31–60', '31–60')}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t('61–90', '61–90')}</th>
                    <th className="py-2 pr-4 text-right font-normal">{t('90+ days', '90+ दिन')}</th>
                    <th className="py-2 text-right font-normal">{t('Total', 'कुल')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(aging?.suppliers ?? []).map((s: any) => (
                    <tr key={s.supplierId} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                      <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">{s.name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{s.current ? fmt(s.current) : '-'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{s.days31to60 ? fmt(s.days31to60) : '-'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{s.days61to90 ? fmt(s.days61to90) : '-'}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${s.days90plus > 0 ? 'font-medium text-red-600 dark:text-red-400' : ''}`}>{s.days90plus ? fmt(s.days90plus) : '-'}</td>
                      <td className="py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{fmt(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-stone-300 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
                    <td className="py-2 pr-4">{t('Total', 'कुल')}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmt(aging?.totals?.current ?? 0)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmt(aging?.totals?.days31to60 ?? 0)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmt(aging?.totals?.days61to90 ?? 0)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmt(aging?.totals?.days90plus ?? 0)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(aging?.totals?.total ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}
    </AppShell>
  )
}

function round(a?: number, b?: number) {
  return Math.round(((a ?? 0) + (b ?? 0) + Number.EPSILON) * 100) / 100
}
