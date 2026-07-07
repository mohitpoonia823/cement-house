'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGstr1, useGstr3b } from '@/hooks/useAccounting'
import { fmt } from '@/lib/utils'
import { downloadCsv } from '@/lib/csv'
import { api } from '@/lib/api'
import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'

function monthToPeriod(month: string) {
  const [y, m] = month.split('-').map(Number)
  return {
    startDate: new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString(),
    endDate: new Date(y, m, 0, 23, 59, 59, 999).toISOString(),
  }
}
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function GstPage() {
  const { language } = useI18n()
  const t = (en: string, hi: string) => (language === 'hi' ? hi : en)
  const [tab, setTab] = useState<'gstr1' | 'gstr3b'>('gstr1')
  const [month, setMonth] = useState(currentMonth())
  const period = useMemo(() => monthToPeriod(month), [month])

  const { data: g1, isLoading: g1Loading } = useGstr1(period)
  const { data: g3, isLoading: g3Loading } = useGstr3b(period)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalWarnings, setPortalWarnings] = useState<string[]>([])
  const [portalError, setPortalError] = useState('')
  const [portalSummary, setPortalSummary] = useState('')

  // GST-portal (offline tool) GSTR-1 JSON — invoice-level B2B/CDNR, importable
  // on gst.gov.in, unlike the human-readable CSV worksheet below.
  async function handlePortalJson() {
    setPortalBusy(true)
    setPortalError('')
    setPortalWarnings([])
    setPortalSummary('')
    try {
      const res = await api.get('/api/accounting/gstr1/portal', { params: period }).then((r) => r.data.data)
      const blob = new Blob([JSON.stringify(res.json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = res.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setPortalWarnings(res.warnings ?? [])
      const s = res.summary
      setPortalSummary(
        `${s.b2bInvoices} B2B invoice(s), ${s.b2csEntries} B2CS entr(ies), ${s.hsnLines} HSN line(s), ${s.cdnrNotes + s.cdnurNotes} credit note(s).`
      )
    } catch (err: any) {
      setPortalError(err?.response?.data?.error ?? t('Portal JSON export failed', 'पोर्टल JSON निर्यात विफल'))
    } finally {
      setPortalBusy(false)
    }
  }

  function handleExport() {
    if (tab === 'gstr1' && g1) {
      const rows: (string | number)[][] = [
        ['GSTR-1 (outward supplies)', month],
        [],
        ['Overall', ''],
        ['Taxable value', g1.overall.taxable],
        ['CGST', g1.overall.cgst],
        ['SGST', g1.overall.sgst],
        ['IGST', g1.overall.igst],
        ['Total tax', g1.overall.gst],
        ['Invoices', g1.overall.invoiceCount],
        [],
        ['By tax rate', ''],
        ['Rate %', 'Taxable', 'CGST', 'SGST', 'IGST'],
        ...g1.byRate.map((r: any) => [r.rate, r.taxable, r.cgst, r.sgst, r.igst]),
        [],
        ['HSN summary', ''],
        ['HSN', 'Qty', 'Taxable', 'Tax'],
        ...g1.hsn.map((h: any) => [h.hsnCode, h.qty, h.taxable, h.gst]),
        [],
        ['Split', 'Invoices', 'Taxable', 'Tax'],
        ['B2B (registered)', g1.b2b.invoiceCount, g1.b2b.taxable, g1.b2b.gst],
        ['B2C (unregistered)', g1.b2c.invoiceCount, g1.b2c.taxable, g1.b2c.gst],
        [],
        ['Credit notes (sales returns)', ''],
        ['Section', 'Notes', 'Taxable', 'Tax', 'Total'],
        ['CDNR (registered)', g1.creditNotes?.cdnr?.noteCount ?? 0, g1.creditNotes?.cdnr?.taxable ?? 0, g1.creditNotes?.cdnr?.gst ?? 0, g1.creditNotes?.cdnr?.total ?? 0],
        ['CDNUR (unregistered)', g1.creditNotes?.cdnur?.noteCount ?? 0, g1.creditNotes?.cdnur?.taxable ?? 0, g1.creditNotes?.cdnur?.gst ?? 0, g1.creditNotes?.cdnur?.total ?? 0],
        [],
        ['Credit note', 'Date', 'Against invoice', 'Customer', 'GSTIN', 'Taxable', 'Tax', 'Total'],
        ...(g1.creditNotes?.notes ?? []).map((n: any) => [
          n.returnNumber,
          String(n.returnDate).slice(0, 10),
          n.invoiceNumber,
          n.customerName,
          n.customerGstin ?? '',
          n.taxable,
          n.gst,
          n.total,
        ]),
        [],
        ['Net outward (after credit notes)', ''],
        ['Taxable value', g1.netOutward?.taxable ?? g1.overall.taxable],
        ['Total tax', g1.netOutward?.gst ?? g1.overall.gst],
      ]
      downloadCsv(`gstr1-${month}`, rows)
    } else if (tab === 'gstr3b' && g3) {
      const rows: (string | number)[][] = [
        ['GSTR-3B (net tax)', month],
        [],
        ['Head', 'CGST', 'SGST', 'IGST', 'Total'],
        ['Output tax (sales, net of credit notes)', g3.output.cgst, g3.output.sgst, g3.output.igst, g3.output.total],
        ['Credit notes adjusted (sales returns)', g3.creditNotes?.cgst ?? 0, g3.creditNotes?.sgst ?? 0, g3.creditNotes?.igst ?? 0, g3.creditNotes?.total ?? 0],
        ['Input tax credit (purchases)', g3.itc.cgst, g3.itc.sgst, g3.itc.igst, g3.itc.total],
        ['Net tax', g3.net.cgst, g3.net.sgst, g3.net.igst, g3.net.total],
        [],
        ['Net GST payable', g3.net.payable],
      ]
      downloadCsv(`gstr3b-${month}`, rows)
    }
  }

  return (
    <AppShell>
      <div className="hidden md:block">
        <SectionHeader
          eyebrow={t('GST returns', 'GST रिटर्न')}
          title={t('GSTR-1 and GSTR-3B', 'GSTR-1 और GSTR-3B')}
          description={t('Outward supplies (sales) and the net tax summary after input credit on purchases.', 'बाहरी आपूर्ति (बिक्री) और खरीद पर इनपुट क्रेडिट के बाद शुद्ध कर सारांश।')}
        />
      </div>
      <div className="mb-4 md:hidden"><h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{t('GST', 'GST')}</h1></div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setTab('gstr1')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === 'gstr1' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{t('GSTR-1 (sales)', 'GSTR-1 (बिक्री)')}</button>
        <button onClick={() => setTab('gstr3b')} className={`rounded-full px-4 py-1.5 text-xs font-medium ${tab === 'gstr3b' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{t('GSTR-3B (net tax)', 'GSTR-3B (शुद्ध कर)')}</button>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
        <button onClick={handleExport} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          {t('Download CSV', 'CSV डाउनलोड करें')}
        </button>
        {tab === 'gstr1' && (
          <button onClick={handlePortalJson} disabled={portalBusy}
            className="rounded-full border border-emerald-300 px-4 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950">
            {portalBusy ? t('Preparing...', 'तैयार हो रहा है...') : t('Portal JSON (gst.gov.in)', 'पोर्टल JSON (gst.gov.in)')}
          </button>
        )}
      </div>

      {portalError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {portalError}
        </div>
      )}
      {portalSummary && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <div className="font-semibold">{t('Portal JSON downloaded', 'पोर्टल JSON डाउनलोड हुआ')} — {portalSummary}</div>
          {portalWarnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-amber-800 dark:text-amber-200">
              {portalWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {tab === 'gstr1' && (
        <>
          <MetricGrid className="mb-6">
            <MetricCard label={t('Taxable value', 'कर योग्य मूल्य')} value={g1Loading ? '—' : fmt(g1?.overall?.taxable ?? 0)} hint={`${g1?.overall?.invoiceCount ?? 0} ${t('invoices', 'इनवॉइस')}`} tone="brand" />
            <MetricCard label={t('CGST + SGST', 'CGST + SGST')} value={g1Loading ? '—' : fmt((g1?.overall?.cgst ?? 0) + (g1?.overall?.sgst ?? 0))} hint={t('Intra-state tax', 'राज्य-अंदर कर')} />
            <MetricCard label={t('IGST', 'IGST')} value={g1Loading ? '—' : fmt(g1?.overall?.igst ?? 0)} hint={t('Inter-state tax', 'अंतर-राज्य कर')} />
            <MetricCard label={t('Total tax', 'कुल कर')} value={g1Loading ? '—' : fmt(g1?.overall?.gst ?? 0)} hint={t('Output GST', 'आउटपुट GST')} tone="warning" />
          </MetricGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('Tax rate summary', 'कर दर सारांश')}</div>
              {g1Loading ? <div className="h-24 rounded-xl bg-slate-50 dark:bg-slate-800/50" /> : (g1?.byRate ?? []).length === 0 ? <EmptyState title={t('No sales', 'कोई बिक्री नहीं')} sub={t('No invoices in this period', 'इस अवधि में कोई इनवॉइस नहीं')} /> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-stone-200 text-stone-400 dark:border-stone-700 dark:text-slate-300"><th className="py-2 text-left font-normal">{t('Rate', 'दर')}</th><th className="py-2 text-right font-normal">{t('Taxable', 'कर योग्य')}</th><th className="py-2 text-right font-normal">CGST</th><th className="py-2 text-right font-normal">SGST</th><th className="py-2 text-right font-normal">IGST</th></tr></thead>
                  <tbody>
                    {(g1?.byRate ?? []).map((r: any) => (
                      <tr key={r.rate} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                        <td className="py-2 text-stone-700 dark:text-slate-200">{r.rate}%</td>
                        <td className="py-2 text-right tabular-nums">{fmt(r.taxable)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(r.cgst)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(r.sgst)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(r.igst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-stone-100 p-2 dark:border-slate-800">
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('B2B (registered)', 'B2B (पंजीकृत)')}</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(g1?.b2b?.taxable ?? 0)}</div>
                  <div className="text-[10px] text-stone-400">{g1?.b2b?.invoiceCount ?? 0} {t('invoices', 'इनवॉइस')} · {t('tax', 'कर')} {fmt(g1?.b2b?.gst ?? 0)}</div>
                </div>
                <div className="rounded-lg border border-stone-100 p-2 dark:border-slate-800">
                  <div className="text-[10px] uppercase tracking-wide text-stone-400">{t('B2C (unregistered)', 'B2C (अपंजीकृत)')}</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fmt(g1?.b2c?.taxable ?? 0)}</div>
                  <div className="text-[10px] text-stone-400">{g1?.b2c?.invoiceCount ?? 0} {t('invoices', 'इनवॉइस')} · {t('tax', 'कर')} {fmt(g1?.b2c?.gst ?? 0)}</div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('HSN summary', 'HSN सारांश')}</div>
              {g1Loading ? <div className="h-24 rounded-xl bg-slate-50 dark:bg-slate-800/50" /> : (g1?.hsn ?? []).length === 0 ? <EmptyState title={t('No data', 'कोई डेटा नहीं')} sub="" /> : (
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-stone-200 text-stone-400 dark:border-stone-700 dark:text-slate-300"><th className="py-2 text-left font-normal">HSN</th><th className="py-2 text-right font-normal">{t('Qty', 'मात्रा')}</th><th className="py-2 text-right font-normal">{t('Taxable', 'कर योग्य')}</th><th className="py-2 text-right font-normal">{t('Tax', 'कर')}</th></tr></thead>
                  <tbody>
                    {(g1?.hsn ?? []).map((h: any) => (
                      <tr key={h.hsnCode} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                        <td className="py-2 text-stone-700 dark:text-slate-200">{h.hsnCode}</td>
                        <td className="py-2 text-right tabular-nums">{h.qty}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(h.taxable)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(h.gst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card className="mt-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{t('Credit notes — CDNR / CDNUR (sales returns)', 'क्रेडिट नोट — CDNR / CDNUR (बिक्री वापसी)')}</div>
            {g1Loading ? <div className="h-24 rounded-xl bg-slate-50 dark:bg-slate-800/50" /> : (g1?.creditNotes?.notes ?? []).length === 0 ? (
              <EmptyState title={t('No credit notes', 'कोई क्रेडिट नोट नहीं')} sub={t('No sales returns in this period', 'इस अवधि में कोई बिक्री वापसी नहीं')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 dark:border-stone-700 dark:text-slate-300">
                      <th className="py-2 pr-4 text-left font-normal">{t('Note', 'नोट')}</th>
                      <th className="py-2 pr-4 text-left font-normal">{t('Against invoice', 'इनवॉइस के विरुद्ध')}</th>
                      <th className="py-2 pr-4 text-left font-normal">{t('Customer', 'ग्राहक')}</th>
                      <th className="py-2 pr-4 text-right font-normal">{t('Taxable', 'कर योग्य')}</th>
                      <th className="py-2 pr-4 text-right font-normal">{t('Tax', 'कर')}</th>
                      <th className="py-2 text-right font-normal">{t('Total', 'कुल')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(g1?.creditNotes?.notes ?? []).map((n: any) => (
                      <tr key={n.returnNumber} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                        <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">{n.returnNumber}</td>
                        <td className="py-2 pr-4 text-stone-500 dark:text-slate-400">{n.invoiceNumber}</td>
                        <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">{n.customerName}{n.customerGstin ? <span className="ml-1 text-[10px] text-stone-400">({t('B2B', 'B2B')})</span> : null}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmt(n.taxable)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-red-600 dark:text-red-400">−{fmt(n.gst)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt(n.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 text-[11px] text-stone-500 dark:text-slate-400">
                  {t('Net outward after credit notes:', 'क्रेडिट नोट के बाद शुद्ध आपूर्ति:')}{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{fmt(g1?.netOutward?.taxable ?? g1?.overall?.taxable ?? 0)}</span>
                  {' · '}{t('tax', 'कर')}{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{fmt(g1?.netOutward?.gst ?? g1?.overall?.gst ?? 0)}</span>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'gstr3b' && (
        <>
          <MetricGrid className="mb-6">
            <MetricCard label={t('Output tax', 'आउटपुट कर')} value={g3Loading ? '—' : fmt(g3?.output?.total ?? 0)} hint={t('GST on sales', 'बिक्री पर GST')} tone="warning" />
            <MetricCard label={t('Input tax credit', 'इनपुट टैक्स क्रेडिट')} value={g3Loading ? '—' : fmt(g3?.itc?.total ?? 0)} hint={t('GST on purchases', 'खरीद पर GST')} tone="success" />
            <MetricCard label={t('Net GST payable', 'शुद्ध देय GST')} value={g3Loading ? '—' : fmt(g3?.net?.payable ?? 0)} hint={t('Output − ITC', 'आउटपुट − ITC')} tone="danger" />
            <MetricCard label={t('Net position', 'शुद्ध स्थिति')} value={g3Loading ? '—' : fmt(g3?.net?.total ?? 0)} hint={Number(g3?.net?.total ?? 0) < 0 ? t('Credit carried forward', 'क्रेडिट आगे') : t('Payable', 'देय')} />
          </MetricGrid>
          <Card>
            {g3Loading ? <div className="h-40 rounded-xl bg-slate-50 dark:bg-slate-800/50" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 dark:border-stone-700 dark:text-slate-300">
                      <th className="py-2 pr-4 text-left font-normal">{t('Head', 'मद')}</th>
                      <th className="py-2 pr-4 text-right font-normal">CGST</th>
                      <th className="py-2 pr-4 text-right font-normal">SGST</th>
                      <th className="py-2 pr-4 text-right font-normal">IGST</th>
                      <th className="py-2 text-right font-normal">{t('Total', 'कुल')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-stone-50 dark:border-stone-800">
                      <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">{t('Output tax (sales)', 'आउटपुट कर (बिक्री)')}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(g3?.output?.cgst ?? 0)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(g3?.output?.sgst ?? 0)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(g3?.output?.igst ?? 0)}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{fmt(g3?.output?.total ?? 0)}</td>
                    </tr>
                    {Number(g3?.creditNotes?.total ?? 0) > 0 && (
                      <tr className="border-b border-stone-50 dark:border-stone-800">
                        <td className="py-2 pr-4 text-stone-500 dark:text-slate-400">{t('(Already net of credit notes)', '(क्रेडिट नोट पहले ही घटाए गए)')}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-stone-400">−{fmt(g3?.creditNotes?.cgst ?? 0)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-stone-400">−{fmt(g3?.creditNotes?.sgst ?? 0)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-stone-400">−{fmt(g3?.creditNotes?.igst ?? 0)}</td>
                        <td className="py-2 text-right tabular-nums text-stone-400">−{fmt(g3?.creditNotes?.total ?? 0)}</td>
                      </tr>
                    )}
                    <tr className="border-b border-stone-50 dark:border-stone-800">
                      <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">{t('Less: input credit (purchases)', 'घटाएँ: इनपुट क्रेडिट (खरीद)')}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-green-600 dark:text-green-400">{fmt(g3?.itc?.cgst ?? 0)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-green-600 dark:text-green-400">{fmt(g3?.itc?.sgst ?? 0)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-green-600 dark:text-green-400">{fmt(g3?.itc?.igst ?? 0)}</td>
                      <td className="py-2 text-right font-medium tabular-nums text-green-600 dark:text-green-400">{fmt(g3?.itc?.total ?? 0)}</td>
                    </tr>
                    <tr className="border-t-2 border-stone-300 font-semibold text-slate-900 dark:border-slate-600 dark:text-slate-100">
                      <td className="py-2 pr-4">{t('Net tax', 'शुद्ध कर')}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(g3?.net?.cgst ?? 0)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(g3?.net?.sgst ?? 0)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmt(g3?.net?.igst ?? 0)}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(g3?.net?.total ?? 0)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-3 text-[11px] text-stone-500 dark:text-slate-400">
                  {t('Net GST payable this period:', 'इस अवधि में देय शुद्ध GST:')} <span className="font-semibold text-red-600 dark:text-red-400">{fmt(g3?.net?.payable ?? 0)}</span>
                  {Number(g3?.net?.total ?? 0) < 0 ? ` · ${t('Excess input credit carries forward.', 'अतिरिक्त इनपुट क्रेडिट आगे बढ़ता है।')}` : ''}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  )
}
