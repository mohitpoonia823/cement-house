'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useSuppliers,
  useSupplier,
  useCreateSupplier,
  useRecordSupplierPayment,
  useRecordSupplierPurchase,
} from '@/hooks/useSuppliers'
import { useInventoryOptions } from '@/hooks/useInventory'
import { fmt, fmtDate } from '@/lib/utils'
import { useMemo, useState, Suspense } from 'react'
import { useI18n } from '@/lib/i18n'
import { ExportCsvButton } from '@/components/common/ExportCsvButton'
import { NumberInput } from '@/components/ui/NumberInput'

const PAYMENT_MODES = ['CASH', 'UPI', 'CHEQUE', 'BANK']

type BillRow = { materialId: string; description: string; quantity: string; unitCost: string; gstRate: string }
const emptyRow = (): BillRow => ({ materialId: '', description: '', quantity: '1', unitCost: '', gstRate: '0' })

export default function SuppliersPage() {
  return (
    <Suspense fallback={<AppShell><PageLoader /></AppShell>}>
      <SuppliersContent />
    </Suspense>
  )
}

function SuppliersContent() {
  const { language } = useI18n()
  const t = (en: string, hi: string) => (language === 'hi' ? hi : en)

  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [showPayForm, setShowPayForm] = useState(false)
  const [showBillForm, setShowBillForm] = useState(false)
  const [formError, setFormError] = useState('')

  // New supplier form
  const [supName, setSupName] = useState('')
  const [supPhone, setSupPhone] = useState('')
  const [supGstin, setSupGstin] = useState('')
  const [supOpening, setSupOpening] = useState('')

  // Payment form
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('CASH')
  const [payRef, setPayRef] = useState('')

  // Bill form
  const [billInvoice, setBillInvoice] = useState('')
  const [billInterState, setBillInterState] = useState(false)
  const [billRows, setBillRows] = useState<BillRow[]>([emptyRow()])

  const { data: suppliers, isLoading: sLoading } = useSuppliers()
  const { data: detail, isLoading: dLoading } = useSupplier(selectedId)
  const { data: materialOptions } = useInventoryOptions({ enabled: showBillForm })
  const createSupplier = useCreateSupplier()
  const recordPayment = useRecordSupplierPayment()
  const recordPurchase = useRecordSupplierPurchase()

  const list = useMemo(
    () => (suppliers ?? []).filter((s: any) => s.name.toLowerCase().includes(search.toLowerCase())),
    [suppliers, search],
  )
  const selected = useMemo(
    () => (suppliers ?? []).find((s: any) => s.supplierId === selectedId),
    [suppliers, selectedId],
  )
  const suppliersWithDues = useMemo(
    () => (suppliers ?? []).filter((s: any) => Number(s.balance) > 0).length,
    [suppliers],
  )
  const totalPayable = useMemo(
    () => (suppliers ?? []).reduce((sum: number, s: any) => sum + Math.max(0, Number(s.balance)), 0),
    [suppliers],
  )

  const billTotals = useMemo(() => {
    let taxable = 0
    let gst = 0
    for (const r of billRows) {
      const qty = Number(r.quantity) || 0
      const cost = Number(r.unitCost) || 0
      const rate = Number(r.gstRate) || 0
      const lineTaxable = qty * cost
      taxable += lineTaxable
      gst += (lineTaxable * rate) / 100
    }
    return { taxable, gst, total: taxable + gst }
  }, [billRows])

  async function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    try {
      const created = await createSupplier.mutateAsync({
        name: supName,
        phone: supPhone || undefined,
        gstin: supGstin || undefined,
        openingBalance: Number(supOpening) || 0,
      })
      setShowAddSupplier(false)
      setSupName(''); setSupPhone(''); setSupGstin(''); setSupOpening('')
      if (created?.id) setSelectedId(created.id)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to add supplier')
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    try {
      await recordPayment.mutateAsync({
        supplierId: selectedId,
        amount: Number(payAmount),
        paymentMode: payMode,
        reference: payRef || undefined,
      })
      setShowPayForm(false)
      setPayAmount(''); setPayRef('')
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to record payment')
    }
  }

  async function handleBill(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const items = billRows
      .filter((r) => r.materialId && Number(r.quantity) > 0 && Number(r.unitCost) >= 0)
      .map((r) => ({
        materialId: r.materialId,
        description: r.description || undefined,
        quantity: Number(r.quantity),
        unitCost: Number(r.unitCost),
        gstRate: Number(r.gstRate) || 0,
      }))
    if (items.length === 0) {
      setFormError(t('Pick a material and enter qty/rate on at least one line', 'कम से कम एक लाइन पर सामग्री चुनें और मात्रा/दर भरें'))
      return
    }
    try {
      await recordPurchase.mutateAsync({
        supplierId: selectedId,
        supplierInvoiceNumber: billInvoice || undefined,
        isInterState: billInterState,
        items,
      })
      setShowBillForm(false)
      setBillInvoice(''); setBillInterState(false); setBillRows([emptyRow()])
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? err.response?.data?.message ?? err.message ?? 'Failed to record bill')
    }
  }

  const initialLoading = sLoading && !suppliers

  return (
    <AppShell>
      <div className="hidden md:block">
        <SectionHeader
          eyebrow={t('Payables analytics', 'देय राशि एनालिटिक्स')}
          title={t('Suppliers and payables', 'सप्लायर और देय राशि')}
          description={t(
            'Track what you owe each supplier. Every bill and payment posts a balanced double-entry voucher.',
            'हर सप्लायर को देय राशि ट्रैक करें। हर बिल और भुगतान एक संतुलित डबल-एंट्री वाउचर पोस्ट करता है।',
          )}
          action={<ExportCsvButton page="suppliers" label={t('Export suppliers', 'सप्लायर एक्सपोर्ट करें')} />}
        />
      </div>
      <div className="mb-4 md:hidden">
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
          {t('Suppliers and payables', 'सप्लायर और देय राशि')}
        </h1>
        <ExportCsvButton page="suppliers" label={t('Export suppliers', 'सप्लायर एक्सपोर्ट करें')} className="mt-3" />
      </div>

      <MetricGrid className="mb-6">
        <MetricCard
          label={t('Total payable', 'कुल देय')}
          value={initialLoading ? '—' : fmt(totalPayable)}
          hint={t('Net amount owed to suppliers', 'सप्लायर को देय कुल राशि')}
          tone="danger"
        />
        <MetricCard
          label={t('Suppliers with dues', 'बकाया वाले सप्लायर')}
          value={initialLoading ? '—' : String(suppliersWithDues)}
          hint={t('Accounts needing payment', 'भुगतान वाले खाते')}
          tone="warning"
        />
        <MetricCard
          label={t('Total suppliers', 'कुल सप्लायर')}
          value={initialLoading ? '—' : String((suppliers ?? []).length)}
          hint={t('Active vendor relationships', 'सक्रिय वेंडर संबंध')}
        />
        <MetricCard
          label={t('Selected account', 'चयनित खाता')}
          value={initialLoading ? '—' : (selected?.name ?? t('None', 'कोई नहीं'))}
          hint={selected ? `${t('Payable', 'देय')} ${fmt(Math.abs(selected.balance ?? 0))}` : t('Pick a supplier', 'एक सप्लायर चुनें')}
          tone="brand"
        />
      </MetricGrid>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Supplier list */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Card className="flex min-h-0 flex-col md:min-h-[520px]">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t('Sundry creditors', 'देनदार')}
              </div>
              <button
                onClick={() => { setShowAddSupplier(true); setFormError('') }}
                className="rounded-lg bg-slate-950 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950"
              >
                {t('+ Add', '+ जोड़ें')}
              </button>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search supplier...', 'सप्लायर खोजें...')}
              className="mb-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />

            {showAddSupplier && (
              <form onSubmit={handleAddSupplier} className="mb-4 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950">
                <input required value={supName} onChange={(e) => setSupName(e.target.value)} placeholder={t('Supplier name', 'सप्लायर का नाम')} className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-xs dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                <input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} placeholder={t('Phone (optional)', 'फोन (वैकल्पिक)')} className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-xs dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                <input value={supGstin} onChange={(e) => setSupGstin(e.target.value)} placeholder={t('GSTIN (optional)', 'GSTIN (वैकल्पिक)')} className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-xs dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                <NumberInput min={0} value={supOpening} onChange={(e) => setSupOpening(e.target.value)} placeholder={t('Opening balance owed', 'शुरुआती देय राशि')} className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-xs dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                <div className="flex gap-2">
                  <button type="submit" disabled={createSupplier.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-700 disabled:opacity-60">
                    {createSupplier.isPending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                    {createSupplier.isPending ? t('Saving...', 'सेव हो रहा है...') : t('Save', 'सेव करें')}
                  </button>
                  <button type="button" onClick={() => setShowAddSupplier(false)} className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700">{t('Cancel', 'रद्द करें')}</button>
                </div>
                {formError && <div className="text-[10px] text-red-600">{formError}</div>}
              </form>
            )}

            <div className="flex-1 overflow-y-auto">
              {sLoading ? (
                <div className="space-y-2">{[1, 2, 3, 4].map((i) => (<div key={i} className="rounded-2xl border border-slate-200/80 px-4 py-3 dark:border-slate-800"><div className="text-sm">—</div><div className="mt-1 text-xs text-slate-500">Loading...</div></div>))}</div>
              ) : list.length === 0 ? (
                <EmptyState title={t('No suppliers', 'कोई सप्लायर नहीं')} sub={t('Add your first supplier to start tracking payables', 'देय राशि ट्रैक करने के लिए पहला सप्लायर जोड़ें')} />
              ) : (
                list.map((s: any) => (
                  <button
                    key={s.supplierId}
                    onClick={() => { setSelectedId(s.supplierId); setShowPayForm(false); setShowBillForm(false) }}
                    className={`mb-2 w-full rounded-2xl px-4 py-3 text-left transition-colors ${
                      selectedId === s.supplierId
                        ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'border border-slate-200/80 bg-white/70 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${selectedId === s.supplierId ? 'text-inherit' : 'text-slate-900 dark:text-slate-100'}`}>{s.name}</div>
                    <div className={`mt-1 text-xs font-medium ${selectedId === s.supplierId ? 'text-inherit/80' : Number(s.balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(s.balance)}</div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {!selectedId ? (
            <Card className="flex min-h-[240px] items-center justify-center md:min-h-[520px]">
              <EmptyState title={t('Select a supplier', 'एक सप्लायर चुनें')} sub={t('Choose a supplier to view their payables ledger', 'देय राशि लेजर देखने के लिए सप्लायर चुनें')} />
            </Card>
          ) : (
            <Card className="flex min-h-0 flex-col md:min-h-[520px]">
              <div className="mb-4 flex flex-col gap-3 border-b border-stone-100 pb-3 dark:border-stone-800 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-medium text-stone-900 dark:text-stone-100">{selected?.name}</div>
                  <div className={`mt-0.5 text-sm font-medium ${Number(detail?.currentBalance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {Number(detail?.currentBalance ?? 0) > 0 ? `${t('Payable', 'देय')}: ` : `${t('Settled', 'निपटान') } - `}
                    {fmt(Math.abs(detail?.currentBalance ?? 0))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                  <button onClick={() => { setShowBillForm((v) => !v); setShowPayForm(false); setFormError('') }} className="w-full rounded-xl bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 sm:w-auto">{t('+ Add bill', '+ बिल जोड़ें')}</button>
                  <button onClick={() => { setShowPayForm((v) => !v); setShowBillForm(false); setFormError('') }} className="w-full rounded-xl bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 sm:w-auto">{t('+ Record payment', '+ भुगतान दर्ज करें')}</button>
                </div>
              </div>

              {showPayForm && (
                <form onSubmit={handlePay} className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                  <div className="mb-2 text-xs font-medium text-green-800 dark:text-green-200">{t('Record payment to supplier', 'सप्लायर को भुगतान दर्ज करें')}</div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {PAYMENT_MODES.map((m) => (
                      <button key={m} type="button" onClick={() => setPayMode(m)} className={`rounded-full border px-2 py-1 text-[10px] transition-colors ${payMode === m ? 'border-green-600 bg-green-600 text-white' : 'border-green-300 text-green-700'}`}>{m}</button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <NumberInput min={1} required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={t('Amount (INR)', 'राशि (INR)')} className="flex-1 rounded-lg border border-green-300 bg-white px-2 py-1.5 text-xs dark:border-green-700 dark:bg-slate-900 dark:text-slate-100" />
                    <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={t('Ref / cheque no (optional)', 'रेफ / चेक नंबर (वैकल्पिक)')} className="flex-1 rounded-lg border border-green-300 bg-white px-2 py-1.5 text-xs dark:border-green-700 dark:bg-slate-900 dark:text-slate-100" />
                    <button type="submit" disabled={recordPayment.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-60">
                      {recordPayment.isPending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                      {recordPayment.isPending ? t('Saving...', 'सेव हो रहा है...') : t('Save', 'सेव करें')}
                    </button>
                  </div>
                  {formError && <div className="mt-1 text-[10px] text-red-600">{formError}</div>}
                </form>
              )}

              {showBillForm && (
                <form onSubmit={handleBill} className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-sky-800 dark:text-sky-200">{t('New purchase bill', 'नया खरीद बिल')}</span>
                    <input value={billInvoice} onChange={(e) => setBillInvoice(e.target.value)} placeholder={t('Supplier invoice no', 'सप्लायर इनवॉइस नंबर')} className="rounded-lg border border-sky-300 bg-white px-2 py-1 text-[11px] dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                    <label className="flex items-center gap-1 text-[11px] text-sky-800 dark:text-sky-200">
                      <input type="checkbox" checked={billInterState} onChange={(e) => setBillInterState(e.target.checked)} />
                      {t('Inter-state (IGST)', 'अंतर-राज्य (IGST)')}
                    </label>
                  </div>
                  <div className="mb-1 grid grid-cols-12 gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    <div className="col-span-5">{t('Material', 'सामग्री')}</div>
                    <div className="col-span-2">{t('Qty', 'मात्रा')}</div>
                    <div className="col-span-2">{t('Rate (₹)', 'दर (₹)')}</div>
                    <div className="col-span-2">{t('GST %', 'GST %')}</div>
                    <div className="col-span-1" />
                  </div>
                  <div className="space-y-2">
                    {billRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5">
                        <select
                          value={row.materialId}
                          onChange={(e) => setBillRows((rows) => rows.map((r, i) => {
                            if (i !== idx) return r
                            const mat = (materialOptions ?? []).find((m: any) => m.id === e.target.value)
                            return {
                              ...r,
                              materialId: e.target.value,
                              description: mat?.name ?? '',
                              unitCost: r.unitCost || (mat?.purchasePrice != null ? String(mat.purchasePrice) : ''),
                            }
                          }))}
                          className="col-span-5 rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-[11px] dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">{t('Select material...', 'सामग्री चुनें...')}</option>
                          {(materialOptions ?? []).map((m: any) => (
                            <option key={m.id} value={m.id}>{m.name}{m.unit ? ` (${m.unit})` : ''}</option>
                          ))}
                        </select>
                        <NumberInput min={0} step="0.001" value={row.quantity} onChange={(e) => setBillRows((rows) => rows.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))} placeholder={t('Qty', 'मात्रा')} className="col-span-2 rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-[11px] dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                        <NumberInput min={0} step="0.01" value={row.unitCost} onChange={(e) => setBillRows((rows) => rows.map((r, i) => i === idx ? { ...r, unitCost: e.target.value } : r))} placeholder={t('Rate', 'दर')} className="col-span-2 rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-[11px] dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                        <NumberInput min={0} max={100} step="0.01" value={row.gstRate} onChange={(e) => setBillRows((rows) => rows.map((r, i) => i === idx ? { ...r, gstRate: e.target.value } : r))} placeholder={t('GST%', 'GST%')} className="col-span-2 rounded-lg border border-sky-300 bg-white px-2 py-1.5 text-[11px] dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100" />
                        <button type="button" onClick={() => setBillRows((rows) => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows)} className="col-span-1 text-sm text-slate-300 hover:text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setBillRows((rows) => [...rows, emptyRow()])} className="mt-1 text-[11px] text-sky-600 hover:underline">{t('+ Add line', '+ लाइन जोड़ें')}</button>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-sky-200 pt-2 dark:border-sky-800">
                    <div className="text-[11px] text-sky-800 dark:text-sky-200">
                      {t('Taxable', 'कर योग्य')} {fmt(billTotals.taxable)} · {t('GST', 'GST')} {fmt(billTotals.gst)} · <span className="font-semibold">{t('Total', 'कुल')} {fmt(billTotals.total)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={recordPurchase.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-700 disabled:opacity-60">
                        {recordPurchase.isPending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                        {recordPurchase.isPending ? t('Posting...', 'पोस्ट हो रहा है...') : t('Post bill', 'बिल पोस्ट करें')}
                      </button>
                      <button type="button" onClick={() => setShowBillForm(false)} className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700">{t('Cancel', 'रद्द करें')}</button>
                    </div>
                  </div>
                  {formError && <div className="mt-1 text-[10px] text-red-600">{formError}</div>}
                </form>
              )}

              {dLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => (<div key={i} className="rounded-2xl border border-slate-200/90 p-3 dark:border-slate-700"><div className="text-[11px] text-slate-500">Loading...</div></div>))}</div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[720px] text-xs">
                      <thead className="sticky top-0 bg-white dark:bg-slate-900">
                        <tr className="border-b border-stone-100 dark:border-stone-800">
                          {[t('Date', 'तारीख'), t('Voucher', 'वाउचर'), t('Particulars', 'विवरण'), t('Bill (Cr)', 'बिल (Cr)'), t('Paid (Dr)', 'भुगतान (Dr)'), t('Balance', 'बैलेंस')].map((h) => (
                            <th key={h} className="py-2 pr-4 text-left font-normal text-stone-400 dark:text-slate-300">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(detail?.entries ?? []).map((e: any) => (
                          <tr key={e.id} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                            <td className="py-2 pr-4 text-stone-500 dark:text-slate-300">{fmtDate(e.date)}</td>
                            <td className="py-2 pr-4 text-stone-400 dark:text-slate-400">{e.voucherNumber}</td>
                            <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">
                              {e.narration ?? e.voucherType}
                              {e.reference && <span className="text-stone-400 dark:text-slate-400"> - {e.reference}</span>}
                            </td>
                            <td className="py-2 pr-4 font-medium text-red-600 dark:text-red-400">{e.billAmount ? fmt(e.billAmount) : '-'}</td>
                            <td className="py-2 pr-4 font-medium text-green-700 dark:text-green-400">{e.paidAmount ? fmt(e.paidAmount) : '-'}</td>
                            <td className={`py-2 font-medium ${e.runningBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-slate-300'}`}>{e.runningBalance > 0 ? fmt(e.runningBalance) : t('Settled', 'निपटान')}</td>
                          </tr>
                        ))}
                        {(detail?.entries ?? []).length === 0 && (
                          <tr><td colSpan={6} className="py-6 text-center text-stone-400">{t('No entries yet. Add a bill to begin.', 'अभी कोई एंट्री नहीं। शुरू करने के लिए बिल जोड़ें।')}</td></tr>
                        )}
                      </tbody>
                      {Number(detail?.currentBalance ?? 0) > 0 && (
                        <tfoot>
                          <tr className="border-t border-stone-200 bg-stone-50 dark:border-slate-600 dark:bg-slate-800/65">
                            <td colSpan={5} className="py-2 pr-4 text-xs font-medium text-stone-600 dark:text-stone-300">{t('Current payable', 'वर्तमान देय')}</td>
                            <td className="py-2 text-sm font-medium text-red-600 dark:text-red-400">{fmt(detail.currentBalance)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="space-y-2 md:hidden">
                    {(detail?.entries ?? []).map((e: any) => (
                      <div key={e.id} className="rounded-2xl border border-slate-200/90 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{fmtDate(e.date)} · {e.voucherNumber}</div>
                          <div className={`rounded-full px-2 py-1 text-[10px] font-semibold ${e.billAmount ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>{e.billAmount ? fmt(e.billAmount) : fmt(e.paidAmount)}</div>
                        </div>
                        <div className="mt-1 text-[12px] font-medium text-slate-800 dark:text-slate-100">{e.narration ?? e.voucherType}</div>
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t('Balance', 'बैलेंस')}: {e.runningBalance > 0 ? fmt(e.runningBalance) : t('Settled', 'निपटान')}</div>
                      </div>
                    ))}
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
