'use client'
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { Card, KpiCard, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'

type ReportTabKey =
  | 'sales'
  | 'inventory'
  | 'gst'
  | 'payments'
  | 'profit-loss'
  | 'customers'
  | 'returns'
  | 'expenses'
  | 'transport'
  | 'expiry'
  | 'batch'
  | 'serial'

type SortDir = 'asc' | 'desc'

const TAB_TO_ENDPOINT: Record<ReportTabKey, string> = {
  sales: '/api/reports/sales-invoices',
  inventory: '/api/reports/inventory-stock',
  gst: '/api/reports/hsn-summary',
  payments: '/api/reports/payment-collections',
  'profit-loss': '/api/reports/profit-loss',
  customers: '/api/reports/customer-dues',
  returns: '/api/reports/sales-returns',
  expenses: '/api/reports/expenses',
  transport: '/api/reports/transport',
  expiry: '/api/reports/expiry',
  batch: '/api/reports/batch',
  serial: '/api/reports/serial',
}

function useReportsCatalog() {
  return useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: () => api.get('/api/reports/catalog').then((r) => r.data.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

function useReportFilters() {
  return useQuery({
    queryKey: ['reports', 'filters'],
    queryFn: () => api.get('/api/reports/filters').then((r) => r.data.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

function useReportData(tab: ReportTabKey, filters: Record<string, string>) {
  return useQuery({
    queryKey: ['reports', tab, filters],
    queryFn: () => api.get(TAB_TO_ENDPOINT[tab], { params: filters }).then((r) => r.data.data),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  })
}

function toDateValue(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function exportReport(page: string, filters: Record<string, string>, format: 'csv' | 'xlsx' = 'csv') {
  const token = window.localStorage.getItem('auth_token')
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const query = new URLSearchParams({ page, format, ...filters })
  const response = await fetch(`${baseUrl}/api/reports/export?${query.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `Export failed (${response.status})`)
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') ?? ''
  const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${page}.csv`
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function valueForSort(v: unknown): number | string {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v.toLowerCase()
  if (v instanceof Date) return v.getTime()
  return String(v ?? '').toLowerCase()
}

function humanizeKey(key: string) {
  const map: Record<string, string> = {
    hsnCode: 'HSN/SAC',
    gstAmount: 'GST Amount',
    cgstAmount: 'CGST',
    sgstAmount: 'SGST',
    igstAmount: 'IGST',
    taxableAmount: 'Taxable Amount',
    quantitySold: 'Quantity Sold',
    salesAmount: 'Sales Amount',
    totalPaid: 'Total Paid',
    paymentMode: 'Payment Mode',
    stockQty: 'Stock Qty',
    minThreshold: 'Min Threshold',
    maxThreshold: 'Max Threshold',
    createdAt: 'Created At',
    expiryDate: 'Expiry Date',
    manufactureDate: 'Manufacture Date',
    returnCount: 'Return Count',
    totalReturnAmount: 'Return Amount',
    gstReversalAmount: 'GST Reversal',
    ledgerAdjustmentAmount: 'Ledger Adjustment',
    grossMarginPct: 'Gross Margin %',
    salesRevenue: 'Sales Revenue',
    purchaseCost: 'Purchase Cost',
    grossProfit: 'Gross Profit',
  }
  if (map[key]) return map[key]
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function mobileTabLabel(key: ReportTabKey) {
  const map: Record<ReportTabKey, string> = {
    sales: 'Sales',
    inventory: 'Stock',
    gst: 'GST',
    payments: 'Payments',
    'profit-loss': 'P&L',
    customers: 'Customers',
    returns: 'Returns',
    expenses: 'Expenses',
    transport: 'Transport',
    expiry: 'Expiry',
    batch: 'Batch',
    serial: 'Serial',
  }
  return map[key] ?? key
}

function SortablePagedTable({
  rows,
  columns,
  initialPageSize = 10,
  tableId = 'default',
}: {
  rows: Record<string, unknown>[]
  columns: Array<{ key: string; label: string; format?: (v: unknown, row: Record<string, unknown>) => string }>
  initialPageSize?: number
  tableId?: string
}) {
  const [sortKey, setSortKey] = useState(columns[0]?.key ?? 'id')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, true]))
  )

  useEffect(() => {
    setVisibleColumns((prev) => {
      const next: Record<string, boolean> = {}
      for (const c of columns) next[c.key] = prev[c.key] ?? true
      return next
    })
  }, [columns])

  const activeColumns = columns.filter((c) => visibleColumns[c.key] !== false)

  const sorted = useMemo(() => {
    const cloned = [...rows]
    cloned.sort((a, b) => {
      const av = valueForSort(a[sortKey])
      const bv = valueForSort(b[sortKey])
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return cloned
  }, [rows, sortKey, sortDir])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pages)
  const start = (safePage - 1) * pageSize
  const current = sorted.slice(start, start + pageSize)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="hidden flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 text-xs dark:border-slate-800 md:flex">
        <span className="font-semibold text-slate-500">Columns:</span>
        {columns.map((col) => (
          <label key={`${tableId}-${col.key}`} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-1">
            <input
              type="checkbox"
              checked={visibleColumns[col.key] !== false}
              onChange={(e) =>
                setVisibleColumns((prev) => ({
                  ...prev,
                  [col.key]: e.target.checked,
                }))
              }
            />
            <span>{col.label}</span>
          </label>
        ))}
      </div>
      <div className="space-y-2 p-3 md:hidden">
        {current.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            No data in selected filters.
          </div>
        ) : current.map((row, idx) => (
          <div key={`${idx}-${String(row[columns[0].key] ?? 'row-mobile')}`} className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {activeColumns.map((col) => (
                <div key={col.key} className="min-w-0">
                  <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{col.label}</div>
                  <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                    {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '-')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/90 backdrop-blur">
            <tr>
              {activeColumns.map((col, colIdx) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300 ${
                    colIdx === 0 ? 'sticky left-0 z-20 bg-slate-50 dark:bg-slate-900/95' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                      else {
                        setSortKey(col.key)
                        setSortDir('desc')
                      }
                    }}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                  >
                    {col.label}
                    {sortKey === col.key ? <span>{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {current.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={activeColumns.length}>No data in selected filters.</td>
              </tr>
            ) : current.map((row, idx) => (
              <tr key={`${idx}-${String(row[columns[0].key] ?? 'row')}`} className="border-t border-slate-200 dark:border-slate-800">
                {activeColumns.map((col, colIdx) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-slate-700 dark:text-slate-200 ${
                      colIdx === 0 ? 'sticky left-0 z-10 bg-white dark:bg-slate-950' : ''
                    }`}
                  >
                    {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>{sorted.length} rows</span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
            Prev
          </button>
          <span>Page {safePage} / {pages}</span>
          <button type="button" disabled={safePage >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

function BarList({
  rows,
  labelKey,
  valueKey,
}: {
  rows: Record<string, unknown>[]
  labelKey: string
  valueKey: string
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] ?? 0)))
  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const value = Number(row[valueKey] ?? 0)
        return (
          <div key={`${idx}-${String(row[labelKey] ?? 'item')}`}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-200">{String(row[labelKey] ?? '-')}</span>
              <span className="text-slate-500 dark:text-slate-400">{fmt(value)}</span>
            </div>
            <div className="h-2 rounded bg-slate-200 dark:bg-slate-800">
              <div className="h-2 rounded bg-sky-500" style={{ width: `${(value / max) * 100}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReportTabPanel({ tab, data }: { tab: ReportTabKey; data: any }) {
  if (tab === 'sales') {
    const rows = Array.isArray(data) ? data : []
    const totals = rows.reduce(
      (acc, row) => {
        acc.amount += Number(row.amount ?? 0)
        acc.paid += Number(row.paid ?? 0)
        acc.due += Number(row.due ?? 0)
        return acc
      },
      { amount: 0, paid: 0, due: 0 }
    )
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <KpiCard label="Invoices" value={String(rows.length)} />
          <KpiCard label="Amount" value={fmt(totals.amount)} />
          <KpiCard label="Paid" value={fmt(totals.paid)} />
          <KpiCard label="Due" value={fmt(totals.due)} />
        </div>
        <SortablePagedTable
          rows={rows}
          columns={[
            { key: 'date', label: 'Date', format: (v) => fmtDate(String(v)) },
            { key: 'invoiceNumber', label: 'Invoice' },
            { key: 'customerName', label: 'Customer' },
            { key: 'amount', label: 'Amount', format: (v) => fmt(Number(v ?? 0)) },
            { key: 'paid', label: 'Paid', format: (v) => fmt(Number(v ?? 0)) },
            { key: 'due', label: 'Due', format: (v) => fmt(Number(v ?? 0)) },
          ]}
          tableId="sales-invoices"
        />
      </div>
    )
  }

  if (tab === 'profit-loss' && data && !Array.isArray(data)) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sales Revenue" value={fmt(data.salesRevenue ?? 0)} />
        <KpiCard label="Purchase Cost" value={fmt(data.purchaseCost ?? 0)} />
        <KpiCard label="Gross Profit" value={fmt(data.grossProfit ?? 0)} />
        <KpiCard label="Gross Margin %" value={`${Number(data.grossMarginPct ?? 0).toFixed(2)}%`} />
      </div>
    )
  }

  if (tab === 'returns' && data && !Array.isArray(data)) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Return Count" value={String(data.returnCount ?? 0)} />
        <KpiCard label="Return Amount" value={fmt(data.totalReturnAmount ?? 0)} />
        <KpiCard label="GST Reversal" value={fmt(data.gstReversalAmount ?? 0)} />
        <KpiCard label="Ledger Adjustment" value={fmt(data.ledgerAdjustmentAmount ?? 0)} />
      </div>
    )
  }

  if (tab === 'gst' && Array.isArray(data)) {
    const totals = data.reduce(
      (acc, row) => {
        acc.taxable += Number(row.taxableAmount ?? 0)
        acc.gst += Number(row.gstAmount ?? 0)
        acc.cgst += Number(row.cgstAmount ?? 0)
        acc.sgst += Number(row.sgstAmount ?? 0)
        acc.igst += Number(row.igstAmount ?? 0)
        return acc
      },
      { taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0 }
    )
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Taxable" value={fmt(totals.taxable)} />
          <KpiCard label="GST" value={fmt(totals.gst)} />
          <KpiCard label="CGST" value={fmt(totals.cgst)} />
          <KpiCard label="SGST" value={fmt(totals.sgst)} />
          <KpiCard label="IGST" value={fmt(totals.igst)} />
        </div>
        <SortablePagedTable
          rows={data}
          columns={[
            { key: 'hsnCode', label: 'HSN/SAC' },
            { key: 'qty', label: 'Qty', format: (v) => fmt(Number(v ?? 0)) },
            { key: 'taxableAmount', label: 'Taxable', format: (v) => fmt(Number(v ?? 0)) },
            { key: 'gstAmount', label: 'GST', format: (v) => fmt(Number(v ?? 0)) },
            { key: 'cgstAmount', label: 'CGST', format: (v) => fmt(Number(v ?? 0)) },
            { key: 'sgstAmount', label: 'SGST', format: (v) => fmt(Number(v ?? 0)) },
            { key: 'igstAmount', label: 'IGST', format: (v) => fmt(Number(v ?? 0)) },
          ]}
        />
      </div>
    )
  }

  if (!Array.isArray(data)) {
    const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
    const rows = Object.entries(obj).map(([key, value]) => ({
      metric: humanizeKey(key),
      value: typeof value === 'number' ? fmt(value) : String(value ?? '-'),
    }))
    return <SortablePagedTable rows={rows} columns={[{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }]} tableId="object-report" />
  }

  if (tab === 'payments' || tab === 'customers') {
    return (
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SortablePagedTable
          rows={data}
          columns={Object.keys(data[0] ?? {}).map((k) => ({
            key: k,
            label: k,
            format: (v) => (typeof v === 'number' ? fmt(v) : String(v ?? '-')),
          }))}
        />
        <Card>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Distribution</div>
          <BarList rows={data.slice(0, 12)} labelKey={tab === 'payments' ? 'paymentMode' : 'name'} valueKey={tab === 'payments' ? 'totalPaid' : 'outstanding'} />
        </Card>
      </div>
    )
  }

  const columns = Object.keys(data[0] ?? {}).map((k) => ({
    key: k,
    label: humanizeKey(k),
    format: (v: unknown) => {
      if (k.toLowerCase().includes('date') && v) return fmtDate(String(v))
      if (typeof v === 'number') return fmt(v)
      return String(v ?? '-')
    },
  }))

  return <SortablePagedTable rows={data} columns={columns} />
}

function LoadingReportPanel({ tab }: { tab: ReportTabKey }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          tab === 'sales' ? 'Invoices' : 'Metric 1',
          tab === 'sales' ? 'Amount' : 'Metric 2',
          tab === 'sales' ? 'Paid' : 'Metric 3',
          tab === 'sales' ? 'Due' : 'Metric 4',
        ].map((label) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">—</div>
            <div className="mt-1 text-xs text-slate-500">Loading...</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mb-3 h-3 w-28 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-2">
          <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-10 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  )
}

function ReportsContent() {
  const user = useAuthStore((s) => s.user)
  const catalog = useReportsCatalog()
  const filterOptions = useReportFilters()
  const availableTabs = useMemo(() => {
    const rows = (catalog.data?.tabs ?? []) as Array<{ key: ReportTabKey; enabled: boolean }>
    return rows.filter((row) => row.enabled).map((row) => row.key)
  }, [catalog.data])
  const [tab, setTab] = useState<ReportTabKey>('sales')
  const today = useMemo(() => new Date(), [])
  const [startDate, setStartDate] = useState(toDateValue(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [endDate, setEndDate] = useState(toDateValue(today))
  const [customerId, setCustomerId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [locationId, setLocationId] = useState('')
  const [presetName, setPresetName] = useState('')
  const [error, setError] = useState('')
  const [presetVersion, setPresetVersion] = useState(0)
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('csv')
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  const presetStorageKey = useMemo(() => {
    const userId = user?.id ?? 'anonymous'
    return `reports-presets:${userId}`
  }, [user?.id])

  const presets = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(presetStorageKey)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [presetStorageKey, presetVersion])

  function savePreset() {
    if (!presetName.trim()) return
    const entry = {
      id: `${Date.now()}`,
      name: presetName.trim(),
      tab,
      filters: { startDate, endDate, customerId, materialId, paymentStatus, orderStatus, locationId },
    }
    const next = [entry, ...presets.filter((p: any) => p.name !== entry.name)].slice(0, 20)
    window.localStorage.setItem(presetStorageKey, JSON.stringify(next))
    setPresetName('')
    setPresetVersion((v) => v + 1)
  }

  function applyPreset(p: any) {
    setTab(p.tab as ReportTabKey)
    setStartDate(String(p.filters?.startDate ?? startDate))
    setEndDate(String(p.filters?.endDate ?? endDate))
    setCustomerId(String(p.filters?.customerId ?? ''))
    setMaterialId(String(p.filters?.materialId ?? ''))
    setPaymentStatus(String(p.filters?.paymentStatus ?? ''))
    setOrderStatus(String(p.filters?.orderStatus ?? ''))
    setLocationId(String(p.filters?.locationId ?? ''))
  }

  function removePreset(id: string) {
    const next = presets.filter((p: any) => p.id !== id)
    window.localStorage.setItem(presetStorageKey, JSON.stringify(next))
    setPresetVersion((v) => v + 1)
  }

  const filters = useMemo(() => {
    const f: Record<string, string> = { startDate, endDate }
    if (customerId) f.customerId = customerId
    if (materialId) f.materialId = materialId
    if (paymentStatus) f.paymentStatus = paymentStatus
    if (orderStatus) f.orderStatus = orderStatus
    if (locationId) f.locationId = locationId
    return f
  }, [startDate, endDate, customerId, materialId, paymentStatus, orderStatus, locationId])

  const report = useReportData(tab, filters)
  const mobilePrimaryTabs = useMemo(() => {
    const preferred: ReportTabKey[] = ['sales', 'inventory', 'gst']
    const picks = preferred.filter((k) => availableTabs.includes(k))
    if (picks.length > 0) return picks
    return availableTabs.slice(0, 3)
  }, [availableTabs])
  const mobileExtraTabs = useMemo(
    () => availableTabs.filter((k) => !mobilePrimaryTabs.includes(k)),
    [availableTabs, mobilePrimaryTabs]
  )

  async function onExport() {
    setError('')
    try {
      const pageMap: Partial<Record<ReportTabKey, string>> = {
        sales: 'sales-summary',
        inventory: 'inventory',
        gst: 'hsn-summary',
        payments: 'payment-collections',
        customers: 'customers',
      }
      await exportReport(pageMap[tab] ?? 'reports', filters, exportFormat)
    } catch (e: any) {
      setError(e.message ?? 'Export failed')
    }
  }

  async function onGstExport(page: 'gstr1' | 'hsn-summary') {
    setError('')
    try {
      await exportReport(page, filters, exportFormat)
    } catch (e: any) {
      setError(e.message ?? 'Export failed')
    }
  }

  const customers = (filterOptions.data?.customers ?? []) as Array<{ id: string; name: string }>
  const materials = (filterOptions.data?.materials ?? []) as Array<{ id: string; name: string }>
  const filterControlClass =
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400'
  const dateControlClass = `${filterControlClass} h-10 pr-3 [color-scheme:light] [&::-webkit-calendar-picker-indicator]:mr-1 [&::-webkit-calendar-picker-indicator]:opacity-80`
  const selectControlClass = `${filterControlClass} h-10 appearance-none pr-10 [&::-ms-expand]:hidden`
  const inputControlClass = `${filterControlClass} h-10`
  const selectChevronStyle: CSSProperties = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5.5 7.5l4.5 4.5 4.5-4.5' stroke='%23475569' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.8rem center',
    backgroundSize: '15px 15px',
  }
  const subtleButtonClass =
    'rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:disabled:bg-slate-900/60 dark:disabled:text-slate-400'

  return (
    <AppShell>
      <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm md:hidden dark:border-slate-700 dark:bg-slate-900/70">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Business intelligence</div>
        <h1 className="mt-1 text-2xl font-semibold leading-tight text-slate-950 dark:text-white">Reports</h1>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
          Sortable reports with compact mobile filters and quick export.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'csv' | 'xlsx')}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>
          <button onClick={onExport} className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-sky-500 dark:text-slate-950">
            Export
          </button>
        </div>
      </div>
      <div className="hidden md:block">
      <SectionHeader
        eyebrow="Business intelligence"
        title="Reports"
        description="Sortable, paginated, feature-aware reports with tenant-scoped filters."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'csv' | 'xlsx')}
              className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
            </select>
            {tab === 'gst' ? (
              <>
                <button onClick={() => onGstExport('gstr1')} className={subtleButtonClass}>
                  Export GSTR-1
                </button>
                <button onClick={() => onGstExport('hsn-summary')} className={subtleButtonClass}>
                  Export HSN
                </button>
              </>
            ) : null}
            <button onClick={onExport} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950">
              Export {exportFormat.toUpperCase()}
            </button>
          </div>
        }
      />
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className={`${dateControlClass} w-full sm:w-auto`} />
          <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" className={`${dateControlClass} w-full sm:w-auto`} />
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`${selectControlClass} w-full sm:w-auto`} style={selectChevronStyle}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={`${selectControlClass} w-full sm:w-auto`} style={selectChevronStyle}>
            <option value="">All products/materials</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className={`${selectControlClass} w-full sm:w-auto`} style={selectChevronStyle}>
            <option value="">Payment status</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL">Partial</option>
            <option value="UNPAID">Unpaid</option>
          </select>
          <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)} className={`${selectControlClass} w-full sm:w-auto`} style={selectChevronStyle}>
            <option value="">Order status</option>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <input value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="Location (optional)" className={`${inputControlClass} w-full sm:w-auto`} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name"
            className={`${inputControlClass} w-full sm:w-auto`}
          />
          <button type="button" onClick={savePreset} className={subtleButtonClass}>
            Save preset
          </button>
          {presets.map((p: any) => (
            <div key={p.id} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900">
              <button type="button" onClick={() => applyPreset(p)} className="font-semibold text-slate-700 dark:text-slate-200">
                {p.name}
              </button>
              <button type="button" onClick={() => removePreset(p.id)} className="text-rose-600">×</button>
            </div>
          ))}
        </div>
      </Card>

      <div className="relative mb-12 flex items-center gap-2 md:hidden">
        {mobilePrimaryTabs.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${tab === key ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-300 text-slate-600'}`}
          >
            {key}
          </button>
        ))}
        {mobileExtraTabs.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMobileMoreOpen((v) => !v)}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold ${
                mobileExtraTabs.includes(tab) || mobileMoreOpen
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              <span className="text-[11px]">•••</span>
              <span>More</span>
            </button>
            {mobileMoreOpen ? (
              <div className="absolute right-0 top-11 z-30 min-w-[160px] rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {mobileExtraTabs.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTab(key)
                      setMobileMoreOpen(false)
                    }}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${
                      tab === key
                        ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {mobileTabLabel(key)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mb-4 hidden flex-wrap gap-2 md:flex">
        {availableTabs.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${tab === key ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'border border-slate-300 text-slate-600'}`}
          >
            {key}
          </button>
        ))}
      </div>

      {error ? <Card className="mb-4 text-sm text-rose-600">{error}</Card> : null}

      {catalog.isLoading || report.isLoading ? (
        <Card>
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tab}</div>
          <LoadingReportPanel tab={tab} />
        </Card>
      ) : (
        <Card>
          <div className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{tab}</div>
          <ReportTabPanel tab={tab} data={report.data} />
        </Card>
      )}
    </AppShell>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <ReportsContent />
    </Suspense>
  )
}

