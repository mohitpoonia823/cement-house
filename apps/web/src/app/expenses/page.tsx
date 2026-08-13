'use client'
import { AppShell } from '@/components/layout/AppShell'
import { Card, MetricCard, MetricGrid, SectionHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useExpenses, useExpenseAccounts, useRecordExpense, useRecordContra, useOpeningBalances, useSetOpeningBalance } from '@/hooks/useAccounting'
import { fmt, fmtDate } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/auth'
import { ExportCsvButton } from '@/components/common/ExportCsvButton'
import { NumberInput } from '@/components/ui/NumberInput'

const NEW_HEAD = '__new__'

export default function ExpensesPage() {
  const { language } = useI18n()
  const t = (en: string, hi: string) => (language === 'hi' ? hi : en)

  const [showExpense, setShowExpense] = useState(false)
  const [showContra, setShowContra] = useState(false)
  const [formError, setFormError] = useState('')

  // Expense form
  const [headSelect, setHeadSelect] = useState('')
  const [newHead, setNewHead] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expPaidVia, setExpPaidVia] = useState<'CASH' | 'BANK'>('CASH')
  const [expRef, setExpRef] = useState('')

  // Contra form
  const [contraDir, setContraDir] = useState<'CASH_TO_BANK' | 'BANK_TO_CASH'>('CASH_TO_BANK')
  const [contraAmount, setContraAmount] = useState('')

  const { data: expensesData, isLoading } = useExpenses()
  const { data: heads } = useExpenseAccounts({ enabled: showExpense })
  const recordExpense = useRecordExpense()
  const recordContra = useRecordContra()

  // Opening balances (owner only)
  const { user } = useAuthStore()
  const isOwner = user?.role === 'OWNER'
  const [showOpening, setShowOpening] = useState(false)
  const [openCash, setOpenCash] = useState('')
  const [openBank, setOpenBank] = useState('')
  const [openingMsg, setOpeningMsg] = useState('')
  const { data: openingBalances } = useOpeningBalances()
  const setOpening = useSetOpeningBalance()
  useEffect(() => {
    if (showOpening && openingBalances) {
      setOpenCash(String(openingBalances.cash ?? 0))
      setOpenBank(String(openingBalances.bank ?? 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOpening, openingBalances?.cash, openingBalances?.bank])

  async function handleOpening(e: React.FormEvent) {
    e.preventDefault()
    setOpeningMsg('')
    setFormError('')
    try {
      const results = await Promise.all([
        setOpening.mutateAsync({ account: 'Cash', amount: Number(openCash) || 0 }),
        setOpening.mutateAsync({ account: 'Bank', amount: Number(openBank) || 0 }),
      ])
      const changed = results.filter((r) => r.changed).length
      setOpeningMsg(changed > 0
        ? t('Opening balances saved as OPENING vouchers.', 'शुरुआती बैलेंस OPENING वाउचर के रूप में सेव हुए।')
        : t('No change — balances already match.', 'कोई बदलाव नहीं — बैलेंस पहले से मेल खाते हैं।'))
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to save opening balances')
    }
  }

  const vouchers = expensesData?.vouchers ?? []
  const expenseTotal = useMemo(
    () => vouchers.filter((v: any) => v.voucherType === 'EXPENSE').reduce((s: number, v: any) => s + Number(v.amount), 0),
    [vouchers],
  )

  async function handleExpense(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const accountName = headSelect === NEW_HEAD ? newHead.trim() : headSelect
    if (!accountName) {
      setFormError(t('Choose or enter an expense head', 'खर्च का मद चुनें या दर्ज करें'))
      return
    }
    try {
      await recordExpense.mutateAsync({
        accountName,
        amount: Number(expAmount),
        paidVia: expPaidVia,
        reference: expRef || undefined,
      })
      setShowExpense(false)
      setHeadSelect(''); setNewHead(''); setExpAmount(''); setExpRef('')
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to record expense')
    }
  }

  async function handleContra(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    try {
      await recordContra.mutateAsync({ direction: contraDir, amount: Number(contraAmount) })
      setShowContra(false)
      setContraAmount('')
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to record transfer')
    }
  }

  return (
    <AppShell>
      <div className="hidden md:block">
        <SectionHeader
          eyebrow={t('Cash & expenses', 'नकद और खर्च')}
          title={t('Cash book and expenses', 'कैश बुक और खर्च')}
          description={t(
            'Record day-to-day expenses and move money between cash and bank. Each entry posts a balanced voucher.',
            'रोज़मर्रा के खर्च दर्ज करें और नकद व बैंक के बीच पैसा ट्रांसफर करें। हर एंट्री एक संतुलित वाउचर पोस्ट करती है।',
          )}
        />
      </div>
      <div className="mb-4 md:hidden">
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{t('Cash & expenses', 'नकद और खर्च')}</h1>
      </div>

      <MetricGrid className="mb-6">
        <MetricCard label={t('Cash in hand', 'नकद')} value={isLoading ? '—' : fmt(expensesData?.cash ?? 0)} hint={t('Balance in cash account', 'कैश खाते में बैलेंस')} tone={Number(expensesData?.cash ?? 0) < 0 ? 'danger' : 'brand'} />
        <MetricCard label={t('Bank balance', 'बैंक बैलेंस')} value={isLoading ? '—' : fmt(expensesData?.bank ?? 0)} hint={t('Balance in bank account', 'बैंक खाते में बैलेंस')} tone={Number(expensesData?.bank ?? 0) < 0 ? 'danger' : 'brand'} />
        <MetricCard label={t('Recent expenses', 'हाल के खर्च')} value={isLoading ? '—' : fmt(expenseTotal)} hint={t('Sum of listed expense vouchers', 'सूचीबद्ध खर्च वाउचर का योग')} tone="warning" />
        <MetricCard label={t('Entries', 'एंट्रीज़')} value={isLoading ? '—' : String(vouchers.length)} hint={t('Expense & transfer vouchers', 'खर्च और ट्रांसफर वाउचर')} />
      </MetricGrid>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => { setShowExpense((v) => !v); setShowContra(false); setShowOpening(false); setFormError('') }} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700">{t('+ Record expense', '+ खर्च दर्ज करें')}</button>
        <button onClick={() => { setShowContra((v) => !v); setShowExpense(false); setShowOpening(false); setFormError('') }} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700">{t('Cash ⇄ Bank transfer', 'नकद ⇄ बैंक ट्रांसफर')}</button>
        {isOwner && (
          <button onClick={() => { setShowOpening((v) => !v); setShowExpense(false); setShowContra(false); setFormError(''); setOpeningMsg('') }} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900">{t('Set opening balances', 'शुरुआती बैलेंस सेट करें')}</button>
        )}
        <ExportCsvButton page="expenses" label={t('Export expenses', 'खर्च एक्सपोर्ट करें')} className="ml-auto rounded-xl" />
      </div>

      {showOpening && isOwner && (
        <Card className="mb-4">
          <form onSubmit={handleOpening} className="flex flex-wrap items-end gap-3">
            <div className="w-full text-xs font-medium text-amber-700 dark:text-amber-300">
              {t('Opening balances (as on the day you started using the app)', 'शुरुआती बैलेंस (जिस दिन से आपने ऐप शुरू किया)')}
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('Cash in hand', 'नकद')}</label>
              <NumberInput min={0} step="0.01" value={openCash} onChange={(e) => setOpenCash(e.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('Bank balance', 'बैंक बैलेंस')}</label>
              <NumberInput min={0} step="0.01" value={openBank} onChange={(e) => setOpenBank(e.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <button type="submit" disabled={setOpening.isPending} className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs text-white hover:bg-amber-700 disabled:opacity-50">{t('Save', 'सेव करें')}</button>
            <button type="button" onClick={() => setShowOpening(false)} className="px-2 py-1.5 text-xs text-stone-500 hover:text-stone-700">{t('Cancel', 'रद्द करें')}</button>
            <div className="w-full text-[10px] text-stone-400 dark:text-slate-400">
              {t('Re-saving posts only the difference as an OPENING voucher, so the books stay append-only.', 'दोबारा सेव करने पर केवल अंतर OPENING वाउचर के रूप में पोस्ट होता है, ताकि बही append-only रहे।')}
            </div>
            {openingMsg && <div className="w-full text-[10px] text-emerald-600 dark:text-emerald-400">{openingMsg}</div>}
            {formError && <div className="w-full text-[10px] text-red-600">{formError}</div>}
          </form>
        </Card>
      )}

      {showExpense && (
        <Card className="mb-4">
          <form onSubmit={handleExpense} className="space-y-3">
            <div className="text-xs font-medium text-rose-700 dark:text-rose-300">{t('New expense', 'नया खर्च')}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('Expense head', 'खर्च मद')}</label>
                <select value={headSelect} onChange={(e) => setHeadSelect(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                  <option value="">{t('Select...', 'चुनें...')}</option>
                  {(heads ?? []).map((h: any) => <option key={h.id} value={h.name}>{h.name}</option>)}
                  <option value={NEW_HEAD}>{t('+ New head...', '+ नया मद...')}</option>
                </select>
              </div>
              {headSelect === NEW_HEAD && (
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('New head name', 'नए मद का नाम')}</label>
                  <input value={newHead} onChange={(e) => setNewHead(e.target.value)} placeholder={t('e.g. Diesel', 'जैसे डीज़ल')} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('Amount', 'राशि')}</label>
                <NumberInput min={1} required value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('Paid via', 'भुगतान माध्यम')}</label>
                <div className="flex gap-2 pt-1">
                  {(['CASH', 'BANK'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setExpPaidVia(m)} className={`rounded-full border px-3 py-1 text-[10px] ${expPaidVia === m ? 'border-rose-600 bg-rose-600 text-white' : 'border-stone-300 text-stone-600'}`}>{m}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={expRef} onChange={(e) => setExpRef(e.target.value)} placeholder={t('Reference / bill no (optional)', 'रेफ / बिल नंबर (वैकल्पिक)')} className="flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
              <button type="submit" disabled={recordExpense.isPending} className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs text-white hover:bg-rose-700 disabled:opacity-50">{t('Post expense', 'खर्च पोस्ट करें')}</button>
              <button type="button" onClick={() => setShowExpense(false)} className="px-2 py-1.5 text-xs text-stone-500 hover:text-stone-700">{t('Cancel', 'रद्द करें')}</button>
            </div>
            {formError && <div className="text-[10px] text-red-600">{formError}</div>}
          </form>
        </Card>
      )}

      {showContra && (
        <Card className="mb-4">
          <form onSubmit={handleContra} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('Direction', 'दिशा')}</label>
              <select value={contraDir} onChange={(e) => setContraDir(e.target.value as any)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                <option value="CASH_TO_BANK">{t('Cash → Bank (deposit)', 'नकद → बैंक (जमा)')}</option>
                <option value="BANK_TO_CASH">{t('Bank → Cash (withdraw)', 'बैंक → नकद (निकासी)')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-stone-500">{t('Amount', 'राशि')}</label>
              <NumberInput min={1} required value={contraAmount} onChange={(e) => setContraAmount(e.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
            </div>
            <button type="submit" disabled={recordContra.isPending} className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs text-white hover:bg-violet-700 disabled:opacity-50">{t('Post transfer', 'ट्रांसफर पोस्ट करें')}</button>
            <button type="button" onClick={() => setShowContra(false)} className="px-2 py-1.5 text-xs text-stone-500 hover:text-stone-700">{t('Cancel', 'रद्द करें')}</button>
            {formError && <div className="w-full text-[10px] text-red-600">{formError}</div>}
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{t('Recent vouchers', 'हाल के वाउचर')}</div>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-50 dark:bg-slate-800/50" />)}</div>
        ) : vouchers.length === 0 ? (
          <EmptyState title={t('No entries yet', 'अभी कोई एंट्री नहीं')} sub={t('Record an expense or a cash/bank transfer to begin', 'शुरू करने के लिए खर्च या नकद/बैंक ट्रांसफर दर्ज करें')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-700">
                  {[t('Date', 'तारीख'), t('Voucher', 'वाउचर'), t('Type', 'प्रकार'), t('Particulars', 'विवरण'), t('Amount', 'राशि')].map((h) => (
                    <th key={h} className="py-2 pr-4 text-left font-normal text-stone-400 dark:text-slate-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v: any) => {
                  const debitLeg = v.lines.find((l: any) => l.debit > 0)
                  const creditLeg = v.lines.find((l: any) => l.credit > 0)
                  return (
                    <tr key={v.id} className="border-b border-stone-50 last:border-0 dark:border-stone-800">
                      <td className="py-2 pr-4 text-stone-500 dark:text-slate-300">{fmtDate(v.date)}</td>
                      <td className="py-2 pr-4 text-stone-400 dark:text-slate-400">{v.voucherNumber}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${v.voucherType === 'EXPENSE' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'}`}>{v.voucherType}</span>
                      </td>
                      <td className="py-2 pr-4 text-stone-700 dark:text-slate-200">
                        {v.narration ?? debitLeg?.accountName}
                        <span className="text-stone-400 dark:text-slate-400"> · {creditLeg?.accountName}</span>
                        {v.reference ? <span className="text-stone-400 dark:text-slate-400"> · {v.reference}</span> : null}
                      </td>
                      <td className="py-2 font-medium text-slate-900 dark:text-slate-100">{fmt(v.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  )
}
