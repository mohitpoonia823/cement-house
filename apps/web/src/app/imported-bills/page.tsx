'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Card, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { usePurchaseBillScans } from '@/hooks/useInventory'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { fmt } from '@/lib/utils'
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities'
import Link from 'next/link'

function statusBadge(status: string) {
  if (status === 'COMMITTED') return 'success'
  if (status === 'CANCELLED') return 'danger'
  return 'warning'
}

function scoreBadge(score: number) {
  if (score >= 0.82) return 'success'
  if (score >= 0.58) return 'warning'
  return 'danger'
}

function labelStatus(status: string, language: string) {
  if (language !== 'hi') return status
  if (status === 'COMMITTED') return 'à¤ªà¥‚à¤°à¥à¤£'
  if (status === 'CANCELLED') return 'à¤°à¤¦à¥à¤¦'
  if (status === 'PENDING') return 'à¤²à¤‚à¤¬à¤¿à¤¤'
  return status
}

export default function ImportedBillsPage() {
  const { language } = useI18n()
  const { hasModule } = useTenantCapabilities()
  const canUseInventory = hasModule('inventory')
  const t = (en: string, hi: string, hinglish?: string) => (language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<'all' | '7d' | '30d' | '90d' | 'custom'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [downloadingId, setDownloadingId] = useState('')
  const { data, isLoading, isFetching } = usePurchaseBillScans(100, search)
  const list = data ?? []
  const initialLoading = isLoading && list.length === 0

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(timer)
  }, [searchInput])

  const filteredList = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    if (range === '7d') start.setDate(now.getDate() - 7)
    if (range === '30d') start.setDate(now.getDate() - 30)
    if (range === '90d') start.setDate(now.getDate() - 90)
    const customStart = fromDate ? new Date(`${fromDate}T00:00:00`) : null
    const customEnd = toDate ? new Date(`${toDate}T23:59:59`) : null

    return list.filter((bill: any) => {
      const sourceDate = bill.invoiceDate ?? bill.createdAt
      if (!sourceDate) return range === 'all'
      const billDate = new Date(sourceDate)
      if (Number.isNaN(billDate.getTime())) return range === 'all'
      if (range === 'all') return true
      if (range === 'custom') {
        if (customStart && billDate < customStart) return false
        if (customEnd && billDate > customEnd) return false
        return true
      }
      return billDate >= start && billDate <= now
    })
  }, [list, range, fromDate, toDate])

  const totalPurchaseCost = useMemo(
    () =>
      filteredList.reduce((sum: number, bill: any) => {
        const amount = Number(bill.totalAmount)
        return Number.isFinite(amount) ? sum + amount : sum
      }, 0),
    [filteredList],
  )

  async function handleDownload(id: string) {
    setDownloadingId(id)
    try {
      const response = await api.get(`/api/inventory/bill-scans/${id}/download`, { responseType: 'blob' })
      const disposition = String(response.headers['content-disposition'] ?? '')
      const match = disposition.match(/filename="([^"]+)"/i)
      const fallbackExt = String(response.headers['content-type'] ?? '').includes('application/json') ? 'json' : 'jpg'
      const filename = match?.[1] ?? `bill-scan-${id}.${fallbackExt}`
      const blob = new Blob([response.data], { type: String(response.headers['content-type'] ?? 'application/octet-stream') })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingId('')
    }
  }

  return (
    <AppShell>
      {!canUseInventory ? (
        <Card className="mb-4">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {language === 'hi' ? 'à¤¯à¤¹ à¤®à¥‰à¤¡à¥à¤¯à¥‚à¤² à¤†à¤ªà¤•à¥‡ à¤ªà¥à¤²à¤¾à¤¨ à¤®à¥‡à¤‚ à¤¸à¤•à¥à¤·à¤® à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤' : 'This module is not enabled for your workspace.'}
          </div>
        </Card>
      ) : null}
      {canUseInventory ? (
      <>
      <SectionHeader
        eyebrow={t('Inventory imports', 'à¤‡à¤¨à¥à¤µà¥‡à¤‚à¤Ÿà¥à¤°à¥€ à¤†à¤¯à¤¾à¤¤')}
        title={t('Imported bills', 'à¤†à¤¯à¤¾à¤¤à¤¿à¤¤ à¤¬à¤¿à¤²')}
        description={t('All scanned purchase bills and their import details in one table.', 'à¤¸à¤­à¥€ à¤¸à¥à¤•à¥ˆà¤¨ à¤•à¤¿à¤ à¤—à¤ à¤–à¤°à¥€à¤¦ à¤¬à¤¿à¤² à¤”à¤° à¤‰à¤¨à¤•à¥‡ à¤†à¤¯à¤¾à¤¤ à¤µà¤¿à¤µà¤°à¤£ à¤à¤• à¤¹à¥€ à¤¤à¤¾à¤²à¤¿à¤•à¤¾ à¤®à¥‡à¤‚à¥¤')}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-stone-500 dark:text-slate-400">{t('Total purchase cost', 'à¤•à¥à¤² à¤–à¤°à¥€à¤¦ à¤²à¤¾à¤—à¤¤')}</div>
            <div className="mt-1 text-2xl font-semibold text-stone-900 dark:text-slate-100">{initialLoading ? '—' : fmt(totalPurchaseCost)}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-slate-400">
              {initialLoading ? 'Loading...' : language === 'hi'
                ? `à¤šà¥à¤¨à¥€ à¤—à¤ˆ à¤…à¤µà¤§à¤¿ à¤®à¥‡à¤‚ ${filteredList.length} à¤¬à¤¿à¤²`
                : `${filteredList.length} bill${filteredList.length === 1 ? '' : 's'} in selected range`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as any)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">{t('All time', 'à¤ªà¥‚à¤°à¤¾ à¤¸à¤®à¤¯')}</option>
              <option value="30d">{t('Last 30 days', 'à¤ªà¤¿à¤›à¤²à¥‡ 30 à¤¦à¤¿à¤¨')}</option>
              <option value="7d">{t('Last 7 days', 'à¤ªà¤¿à¤›à¤²à¥‡ 7 à¤¦à¤¿à¤¨')}</option>
              <option value="90d">{t('Last 90 days', 'à¤ªà¤¿à¤›à¤²à¥‡ 90 à¤¦à¤¿à¤¨')}</option>
              <option value="custom">{t('Custom range', 'à¤•à¤¸à¥à¤Ÿà¤® à¤…à¤µà¤§à¤¿')}</option>
            </select>
            {range === 'custom' && (
              <>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('Search supplier, invoice, file, status...', 'à¤†à¤ªà¥‚à¤°à¥à¤¤à¤¿à¤•à¤°à¥à¤¤à¤¾, à¤‡à¤¨à¤µà¥‰à¤‡à¤¸, à¤«à¤¼à¤¾à¤‡à¤², à¤¸à¥à¤¥à¤¿à¤¤à¤¿ à¤–à¥‹à¤œà¥‡à¤‚...')}
            className="w-full max-w-sm rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                setSearch('')
              }}
              className="rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('Clear', 'à¤¸à¤¾à¤« à¤•à¤°à¥‡à¤‚')}
            </button>
          )}
        </div>

        {isLoading && list.length === 0 ? (
          <div className="space-y-3 py-2">
            <div className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
            <div className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
            <div className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
          </div>
        ) : list.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-sm font-medium text-stone-700 dark:text-slate-200">{t('No scanned bills yet.', 'अभी तक कोई स्कैन बिल नहीं है।', 'Abhi tak koi scanned bill nahi hai.')}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-slate-400">{t('Scan or upload purchase bills to build this list.', 'इस सूची को बनाने के लिए खरीद बिल स्कैन या अपलोड करें।', 'Is list ko banane ke liye purchase bills scan ya upload karo.')}</div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Link href="/inventory" className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-sky-500 dark:text-slate-950">
                {t('Scan bill', 'बिल स्कैन करें', 'Bill scan karo')}
              </Link>
              <Link href="/inventory" className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                {t('Open inventory', 'इन्वेंट्री खोलें', 'Inventory kholo')}
              </Link>
            </div>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-8 text-center text-sm text-stone-500 dark:text-slate-300">{t('No bills found in selected date range.', 'à¤šà¥à¤¨à¥€ à¤—à¤ˆ à¤¤à¤¾à¤°à¥€à¤– à¤¸à¥€à¤®à¤¾ à¤®à¥‡à¤‚ à¤•à¥‹à¤ˆ à¤¬à¤¿à¤² à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤')}</div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {isFetching ? <div className="text-[11px] text-stone-500 dark:text-slate-400">{t('Refreshing...', 'रिफ्रेश हो रहा है...', 'Refreshing...')}</div> : null}
              {filteredList.map((bill: any) => (
                <div key={bill.id} className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{bill.supplierName ?? t('Unknown supplier', 'अज्ञात आपूर्तिकर्ता')}</div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{bill.invoiceNumber ?? bill.fileName ?? '-'}</div>
                    </div>
                    <Badge variant={statusBadge(bill.status) as any}>{labelStatus(bill.status, language)}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div className="text-slate-500 dark:text-slate-400">{t('Bill date', 'बिल तारीख')}</div>
                    <div className="text-right font-medium text-slate-800 dark:text-slate-200">{bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString('en-IN') : '-'}</div>
                    <div className="text-slate-500 dark:text-slate-400">{t('Total', 'कुल')}</div>
                    <div className="text-right font-semibold text-slate-900 dark:text-slate-100">{bill.totalAmount === null ? '-' : fmt(Number(bill.totalAmount))}</div>
                    <div className="text-slate-500 dark:text-slate-400">{t('Confidence', 'भरोसा')}</div>
                    <div className="text-right"><Badge variant={scoreBadge(Number(bill.confidence)) as any}>{Math.round(Number(bill.confidence) * 100)}%</Badge></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{new Date(bill.createdAt).toLocaleDateString('en-IN')}</div>
                    <button
                      type="button"
                      onClick={() => handleDownload(bill.id)}
                      disabled={downloadingId === bill.id}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      {downloadingId === bill.id ? t('Preparing...', 'तैयार हो रहा है...') : t('Download', 'डाउनलोड')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
            {isFetching && <div className="mb-2 text-[11px] text-stone-500 dark:text-slate-400">{t('Refreshing...', 'à¤°à¤¿à¤«à¥à¤°à¥‡à¤¶ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...')}</div>}
            <table className="w-full min-w-[960px] text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500 dark:border-slate-700 dark:text-slate-300">
                  <th className="px-3 py-2 font-medium">{t('Supplier', 'à¤†à¤ªà¥‚à¤°à¥à¤¤à¤¿à¤•à¤°à¥à¤¤à¤¾')}</th>
                  <th className="px-3 py-2 font-medium">{t('Invoice', 'à¤‡à¤¨à¤µà¥‰à¤‡à¤¸')}</th>
                  <th className="px-3 py-2 font-medium">{t('Bill date', 'à¤¬à¤¿à¤² à¤¤à¤¾à¤°à¥€à¤–')}</th>
                  <th className="px-3 py-2 font-medium">{t('Status', 'à¤¸à¥à¤¥à¤¿à¤¤à¤¿')}</th>
                  <th className="px-3 py-2 font-medium">{t('Total', 'à¤•à¥à¤²')}</th>
                  <th className="px-3 py-2 font-medium">{t('Scan confidence', 'à¤¸à¥à¤•à¥ˆà¤¨ à¤­à¤°à¥‹à¤¸à¤¾')}</th>
                  <th className="px-3 py-2 font-medium">{t('Scanned at', 'à¤¸à¥à¤•à¥ˆà¤¨ à¤¸à¤®à¤¯')}</th>
                  <th className="px-3 py-2 font-medium">{t('Download', 'à¤¡à¤¾à¤‰à¤¨à¤²à¥‹à¤¡')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((bill: any) => (
                  <tr key={bill.id} className="border-b border-stone-100 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <div className="font-medium text-stone-900 dark:text-slate-100">{bill.supplierName ?? t('Unknown supplier', 'à¤…à¤œà¥à¤žà¤¾à¤¤ à¤†à¤ªà¥‚à¤°à¥à¤¤à¤¿à¤•à¤°à¥à¤¤à¤¾')}</div>
                    </td>
                    <td className="px-3 py-2 text-stone-700 dark:text-slate-200">{bill.invoiceNumber ?? bill.fileName ?? '-'}</td>
                    <td className="px-3 py-2 text-stone-700 dark:text-slate-200">
                      {bill.invoiceDate ? new Date(bill.invoiceDate).toLocaleDateString('en-IN') : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={statusBadge(bill.status) as any}>{labelStatus(bill.status, language)}</Badge>
                    </td>
                    <td className="px-3 py-2 font-medium text-stone-900 dark:text-slate-100">
                      {bill.totalAmount === null ? '-' : fmt(Number(bill.totalAmount))}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={scoreBadge(Number(bill.confidence)) as any}>{Math.round(Number(bill.confidence) * 100)}%</Badge>
                    </td>
                    <td className="px-3 py-2 text-stone-600 dark:text-slate-300">{new Date(bill.createdAt).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleDownload(bill.id)}
                        disabled={downloadingId === bill.id}
                        className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {downloadingId === bill.id ? t('Preparing...', 'à¤¤à¥ˆà¤¯à¤¾à¤° à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...') : t('Download', 'à¤¡à¤¾à¤‰à¤¨à¤²à¥‹à¤¡')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>
      </>
      ) : null}
    </AppShell>
  )
}

