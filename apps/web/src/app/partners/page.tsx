'use client'

import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card } from '@/components/ui/Card'
import { fmt } from '@/lib/utils'
import {
  useCreateReferralPartner,
  useDeleteReferralPartner,
  useReferralLeaderboard,
  useReferralPartners,
  useUpdateReferralPartner,
} from '@/hooks/useReferralPartners'

type RewardType = 'PERCENT' | 'FLAT'

const DEFAULT_FORM = {
  name: '',
  phone: '',
  role: 'Plumber',
  area: '',
  notes: '',
  rewardType: 'PERCENT' as RewardType,
  rewardValue: 1.5,
}

function kpiTone(kind: 'sales' | 'reward' | 'orders') {
  if (kind === 'sales') return 'from-emerald-50 to-teal-50 border-emerald-200'
  if (kind === 'reward') return 'from-indigo-50 to-sky-50 border-indigo-200'
  return 'from-amber-50 to-orange-50 border-amber-200'
}

function inputCls() {
  return 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200'
}

export default function PartnersPage() {
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(DEFAULT_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const partnersQuery = useReferralPartners(search)
  const leaderboardQuery = useReferralLeaderboard()
  const createPartner = useCreateReferralPartner()
  const updatePartner = useUpdateReferralPartner()
  const deletePartner = useDeleteReferralPartner()

  const partners = partnersQuery.data ?? []
  const leaderboard = leaderboardQuery.data ?? []
  const isSaving = createPartner.isPending || updatePartner.isPending

  const totals = useMemo(() => {
    return leaderboard.reduce(
      (acc: { sales: number; reward: number; orders: number }, row: any) => {
        acc.sales += Number(row.totalSales ?? 0)
        acc.reward += Number(row.totalReward ?? 0)
        acc.orders += Number(row.orderCount ?? 0)
        return acc
      },
      { sales: 0, reward: 0, orders: 0 }
    )
  }, [leaderboard])

  function startEdit(partner: any) {
    setEditingId(partner.id)
    setForm({
      name: partner.name ?? '',
      phone: partner.phone ?? '',
      role: partner.role ?? 'Plumber',
      area: partner.area ?? '',
      notes: partner.notes ?? '',
      rewardType: (partner.rewardType ?? 'PERCENT') as RewardType,
      rewardValue: Number(partner.rewardValue ?? 0),
    })
    setError('')
  }

  function resetForm() {
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setError('')
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.name.trim().length < 2) return setError('Partner name is required')
    if (form.phone.trim().length < 10) return setError('Valid phone is required')
    if (form.rewardType === 'PERCENT' && form.rewardValue > 100) return setError('Percent reward cannot exceed 100')
    if (form.rewardValue < 0) return setError('Reward value cannot be negative')

    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
        role: form.role.trim(),
        area: form.area.trim() || undefined,
        notes: form.notes.trim() || undefined,
        rewardValue: Number(form.rewardValue),
      }
      if (editingId) {
        await updatePartner.mutateAsync({ id: editingId, ...payload })
      } else {
        await createPartner.mutateAsync(payload)
      }
      resetForm()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to save partner')
    }
  }

  async function removePartner(id: string) {
    try {
      await deletePartner.mutateAsync(id)
      if (editingId === id) resetForm()
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to delete partner')
    }
  }

  return (
    <AppShell>
      <div className="space-y-4 pb-20 md:space-y-5 md:pb-6">
        <section className="rounded-2xl border border-slate-200 bg-[linear-gradient(120deg,#f8fafc_0%,#eef6ff_50%,#f8fbff_100%)] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Referral Program</div>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Partner rewards and leaderboard</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Track who brings sales and keep payouts transparent with clear rules.
            </p>
          </div>
        </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Card className={`border bg-gradient-to-br ${kpiTone('sales')}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Referred sales</div>
            <div className="mt-1.5 text-3xl font-semibold text-slate-900">{fmt(totals.sales)}</div>
            <div className="mt-1 text-xs text-slate-600">Total sales linked to partners</div>
          </Card>
          <Card className={`border bg-gradient-to-br ${kpiTone('reward')}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Reward payable</div>
            <div className="mt-1.5 text-3xl font-semibold text-slate-900">{fmt(totals.reward)}</div>
            <div className="mt-1 text-xs text-slate-600">Current calculated payout amount</div>
          </Card>
          <Card className={`border bg-gradient-to-br ${kpiTone('orders')} sm:col-span-2 md:col-span-1`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Referred orders</div>
            <div className="mt-1.5 text-3xl font-semibold text-slate-900">{totals.orders}</div>
            <div className="mt-1 text-xs text-slate-600">Orders attributed to partners</div>
          </Card>
        </section>

        <Card className="border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {editingId ? 'Edit referral partner' : 'Add referral partner'}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Keep reward rule simple and consistent for trust.
            </div>
          </div>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Cancel edit
            </button>
          ) : null}
        </div>

        <form onSubmit={submitForm} className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Name</div>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Partner name" className={inputCls()} />
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Phone</div>
            <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number" className={inputCls()} />
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Role</div>
            <input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} placeholder="Plumber / Electrician / Mistri" className={inputCls()} />
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Area</div>
            <input value={form.area} onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))} placeholder="Area (optional)" className={inputCls()} />
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Reward type</div>
            <select value={form.rewardType} onChange={(e) => setForm((p) => ({ ...p, rewardType: e.target.value as RewardType }))} className={inputCls()}>
              <option value="PERCENT">Percent of order</option>
              <option value="FLAT">Flat per order</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Reward value</div>
            <input type="number" min={0} step={0.01} value={form.rewardValue} onChange={(e) => setForm((p) => ({ ...p, rewardValue: Number(e.target.value) }))} placeholder="Reward value" className={inputCls()} />
          </div>
          <div className="md:col-span-6">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Notes</div>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" className="h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200" />
          </div>

          {error ? <div className="text-sm font-medium text-rose-600 md:col-span-6">{error}</div> : null}

          <div className="md:col-span-6">
            <button type="submit" disabled={isSaving} className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {isSaving ? 'Saving...' : editingId ? 'Update partner' : 'Add partner'}
            </button>
          </div>
        </form>
      </Card>

        <Card className="border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Referral partners</div>
            <div className="mt-1 text-sm text-slate-600">Manage active partners and their default reward rules.</div>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search partner..." className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:w-72" />
        </div>

        <div className="space-y-2">
          {partners.map((partner: any) => (
            <div key={partner.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 md:grid-cols-[2fr_2fr_2fr_auto] md:items-center">
              <div>
                <div className="font-semibold text-slate-900">{partner.name}</div>
                <div className="text-xs text-slate-600">{partner.role}</div>
              </div>
              <div className="text-sm text-slate-700">
                <div>{partner.phone}</div>
                <div className="text-xs text-slate-500">{partner.area || 'No area'}</div>
              </div>
              <div className="text-sm text-slate-700">
                Reward: {partner.rewardType === 'PERCENT' ? `${partner.rewardValue}%` : `${fmt(partner.rewardValue)} / order`}
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(partner)} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">Edit</button>
                <button onClick={() => removePartner(partner.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">Delete</button>
              </div>
            </div>
          ))}
          {!partners.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              No referral partners found. Add your first partner above.
            </div>
          ) : null}
        </div>
        </Card>

        <Card className="border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Top referral partners</div>
          <div className="mt-1 text-sm text-slate-600">Ranked by referred sales to make payout decisions simple.</div>
        </div>

        <div className="space-y-2">
          {leaderboard.map((row: any, index: number) => (
            <div key={row.partnerId} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 px-3 py-3 md:grid-cols-[auto_2fr_1fr_1fr_1fr_1fr] md:items-center">
              <div className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">#{index + 1}</div>
              <div>
                <div className="font-semibold text-slate-900">{row.partnerName}</div>
                <div className="text-xs text-slate-500">{row.partnerRole}</div>
              </div>
              <div className="text-sm text-slate-700">Orders: {row.orderCount}</div>
              <div className="text-sm text-slate-700">Sales: {fmt(row.totalSales)}</div>
              <div className="text-sm text-slate-700">Reward: {fmt(row.totalReward)}</div>
              <div className="text-xs text-slate-500">
                Avg/order: {row.orderCount ? fmt(Number(row.totalSales) / Number(row.orderCount)) : fmt(0)}
              </div>
            </div>
          ))}
          {!leaderboard.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              No referral sales tracked yet. Create orders with a selected referral partner to start rankings.
            </div>
          ) : null}
        </div>
        </Card>
      </div>
    </AppShell>
  )
}
