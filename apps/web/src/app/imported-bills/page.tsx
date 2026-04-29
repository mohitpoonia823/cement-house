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
  if (status === 'COMMITTED') return 'पूर्ण'
  if (status === 'CANCELLED') return 'रद्द'
  if (status === 'PENDING') return 'लंबित'
  return status
}

export default function ImportedBillsPage() {
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) => (language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<'all' | '7d' | '30d' | '90d' | 'custom'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [downloadingId, setDownloadingId] = useState('')
  const { data, isLoading, isFetching } = usePurchaseBillScans(100, search)
  const list = data ?? []

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
      <SectionHeader
        eyebrow={t('Inventory imports', 'इन्वेंट्री आयात')}
        title={t('Imported bills', 'आयातित बिल')}
        description={t('All scanned purchase bills and their import details in one table.', 'सभी स्कैन किए गए खरीद बिल और उनके आयात विवरण एक ही तालिका में।')}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs text-stone-500 dark:text-slate-400">{t('Total purchase cost', 'कुल खरीद लागत')}</div>
            <div className="mt-1 text-2xl font-semibold text-stone-900 dark:text-slate-100">{fmt(totalPurchaseCost)}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-slate-400">
              {language === 'hi'
                ? `चुनी गई अवधि में ${filteredList.length} बिल`
                : `${filteredList.length} bill${filteredList.length === 1 ? '' : 's'} in selected range`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as any)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">{t('All time', 'पूरा समय')}</option>
              <option value="30d">{t('Last 30 days', 'पिछले 30 दिन')}</option>
              <option value="7d">{t('Last 7 days', 'पिछले 7 दिन')}</option>
              <option value="90d">{t('Last 90 days', 'पिछले 90 दिन')}</option>
              <option value="custom">{t('Custom range', 'कस्टम अवधि')}</option>
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
            placeholder={t('Search supplier, invoice, file, status...', 'आपूर्तिकर्ता, इनवॉइस, फ़ाइल, स्थिति खोजें...')}
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
              {t('Clear', 'साफ करें')}
            </button>
          )}
        </div>

        {isLoading && list.length === 0 ? (
          <PageLoader />
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-sm text-stone-500 dark:text-slate-300">{t('No scanned bills yet.', 'अभी तक कोई स्कैन बिल नहीं है।')}</div>
        ) : filteredList.length === 0 ? (
          <div className="py-8 text-center text-sm text-stone-500 dark:text-slate-300">{t('No bills found in selected date range.', 'चुनी गई तारीख सीमा में कोई बिल नहीं मिला।')}</div>
        ) : (
          <div className="overflow-x-auto">
            {isFetching && <div className="mb-2 text-[11px] text-stone-500 dark:text-slate-400">{t('Refreshing...', 'रिफ्रेश हो रहा है...')}</div>}
            <table className="w-full min-w-[960px] text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500 dark:border-slate-700 dark:text-slate-300">
                  <th className="px-3 py-2 font-medium">{t('Supplier', 'आपूर्तिकर्ता')}</th>
                  <th className="px-3 py-2 font-medium">{t('Invoice', 'इनवॉइस')}</th>
                  <th className="px-3 py-2 font-medium">{t('Bill date', 'बिल तारीख')}</th>
                  <th className="px-3 py-2 font-medium">{t('Status', 'स्थिति')}</th>
                  <th className="px-3 py-2 font-medium">{t('Total', 'कुल')}</th>
                  <th className="px-3 py-2 font-medium">{t('Scan confidence', 'स्कैन भरोसा')}</th>
                  <th className="px-3 py-2 font-medium">{t('Scanned at', 'स्कैन समय')}</th>
                  <th className="px-3 py-2 font-medium">{t('Download', 'डाउनलोड')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((bill: any) => (
                  <tr key={bill.id} className="border-b border-stone-100 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <div className="font-medium text-stone-900 dark:text-slate-100">{bill.supplierName ?? t('Unknown supplier', 'अज्ञात आपूर्तिकर्ता')}</div>
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
                        {downloadingId === bill.id ? t('Preparing...', 'तैयार हो रहा है...') : t('Download', 'डाउनलोड')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  )
}
