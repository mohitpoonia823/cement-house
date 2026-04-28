'use client'
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { PaginationBar } from '@/components/super-admin/PaginationBar'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { Card, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useSuperAdminBillingConfig, useSuperAdminBusinesses, type BusinessListItem } from '@/lib/super-admin'
import { api } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'

type BusinessDraft = {
  subscriptionPlan: BusinessListItem['subscriptionPlan']
  subscriptionStatus: BusinessListItem['subscriptionStatus']
  subscriptionInterval: BusinessListItem['subscriptionInterval']
  trialDaysOverride: number | null
  monthlySubscriptionAmount: number
  yearlySubscriptionAmount: number
  suspendedReason: string
}

export default function SuperAdminBusinessesPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('')
  const [drafts, setDrafts] = useState<Record<string, BusinessDraft>>({})
  const [billingDraft, setBillingDraft] = useState({ trialDays: 7, monthlyPrice: 200, yearlyPrice: 2100, currency: 'INR', trialRequiresCard: true })

  const { data, isLoading } = useSuperAdminBusinesses({ page, pageSize: 6, search, status })
  const { data: billingConfig } = useSuperAdminBillingConfig()

  useEffect(() => {
    if (billingConfig) setBillingDraft(billingConfig)
  }, [billingConfig])

  useEffect(() => {
    if (!data?.items) return
    const next = Object.fromEntries(
      data.items.map((business) => [
        business.id,
        {
          subscriptionPlan: business.subscriptionPlan,
          subscriptionStatus: business.subscriptionStatus,
          subscriptionInterval: business.subscriptionInterval,
          trialDaysOverride: business.trialDaysOverride,
          monthlySubscriptionAmount: business.monthlySubscriptionAmount,
          yearlySubscriptionAmount: business.yearlySubscriptionAmount,
          suspendedReason: business.suspendedReason ?? '',
        },
      ])
    )
    setDrafts((current) => ({ ...current, ...next }))
  }, [data])

  const updateBusiness = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.patch(`/api/super-admin/businesses/${id}`, payload).then((res) => res.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin'] })
    },
  })

  const updateBillingConfig = useMutation({
    mutationFn: (payload: typeof billingDraft) => api.patch('/api/super-admin/billing-config', payload).then((res) => res.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin'] })
    },
  })

  if (isLoading) {
    return (
      <SuperAdminShell>
        <PageLoader />
      </SuperAdminShell>
    )
  }

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Business operations"
        title="Paginated business control"
        description="Handle large fleets of trading companies with search, status filters, and page-based browsing instead of one massive scroll."
      />

      <Card className="mb-6">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr_auto]">
          <label className="block">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Search business</div>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1)
                  setSearch(searchInput.trim())
                }
              }}
              placeholder="Search by company, city, or phone"
              className={inputCls}
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Status</div>
            <select
              value={status}
              onChange={(e) => {
                setPage(1)
                setStatus(e.target.value as '' | 'ACTIVE' | 'SUSPENDED')
              }}
              className={inputCls}
            >
              <option value="">All businesses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setPage(1)
                setSearch(searchInput.trim())
              }}
              className="rounded-full bg-slate-950 px-4 py-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
            >
              Apply filters
            </button>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Platform billing defaults</div>
            <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Admin-controlled trial and subscription pricing</div>
          </div>
          <button
            onClick={() => updateBillingConfig.mutate(billingDraft)}
            disabled={updateBillingConfig.isPending}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
          >
            {updateBillingConfig.isPending ? 'Saving...' : 'Save defaults'}
          </button>
        </div>
        <div className="grid gap-4 xl:grid-cols-5">
          <Field label="Trial days">
            <input type="number" min={1} max={90} value={billingDraft.trialDays} onChange={(e) => setBillingDraft((current) => ({ ...current, trialDays: Number(e.target.value) }))} className={inputCls} />
          </Field>
          <Field label="Monthly price">
            <input type="number" min={0} value={billingDraft.monthlyPrice} onChange={(e) => setBillingDraft((current) => ({ ...current, monthlyPrice: Number(e.target.value) }))} className={inputCls} />
          </Field>
          <Field label="Yearly price">
            <input type="number" min={0} value={billingDraft.yearlyPrice} onChange={(e) => setBillingDraft((current) => ({ ...current, yearlyPrice: Number(e.target.value) }))} className={inputCls} />
          </Field>
          <Field label="Currency">
            <input value={billingDraft.currency} maxLength={3} onChange={(e) => setBillingDraft((current) => ({ ...current, currency: e.target.value.toUpperCase() }))} className={inputCls} />
          </Field>
          <label className="flex items-end gap-2 rounded-2xl border border-slate-200/70 px-4 py-3 dark:border-slate-800">
            <input type="checkbox" checked={billingDraft.trialRequiresCard} onChange={(e) => setBillingDraft((current) => ({ ...current, trialRequiresCard: e.target.checked }))} />
            <span className="text-sm text-slate-700 dark:text-slate-200">Require card at trial signup</span>
          </label>
        </div>
      </Card>

      <div className="space-y-4">
        {(data?.items ?? []).map((business) => {
          const draft = drafts[business.id]
          if (!draft) return null

          return (
            <Card key={business.id}>
              <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{business.name}</div>
                    <Badge variant={business.isActive ? 'success' : 'danger'}>{business.isActive ? 'ACTIVE' : 'SUSPENDED'}</Badge>
                    <Badge variant={statusBadge(business.subscriptionStatus)}>{business.subscriptionStatus}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                    {business.city} • Owner {business.ownerName ?? 'N/A'} • {business.totalUsers} users • {business.totalCustomers} customers • {business.totalOrders} orders
                  </div>
                  {business.suspendedReason && (
                    <div className="mt-2 text-xs text-rose-600 dark:text-rose-300">Reason: {business.suspendedReason}</div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniStat label="GMV" value={fmt(business.gmv)} />
                  <MiniStat label="Outstanding" value={fmt(business.outstanding)} />
                  <MiniStat label="Monthly" value={fmt(business.monthlySubscriptionAmount)} />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_auto_1.25fr] xl:items-end">
                <Field label="Owner plan">
                  <div className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {business.subscriptionPlan} {business.subscriptionInterval ? `• ${business.subscriptionInterval}` : ''}
                  </div>
                </Field>
                <Field label="Business status">
                  <button
                    onClick={() =>
                      updateBusiness.mutate({
                        id: business.id,
                        payload: {
                          isActive: !business.isActive,
                          suspendedReason: business.isActive ? draft.suspendedReason || 'Suspended by Super Admin' : null,
                        },
                      })
                    }
                    disabled={updateBusiness.isPending}
                    className="h-11 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {updateBusiness.isPending ? 'Saving...' : business.isActive ? 'Suspend business' : 'Reactivate business'}
                  </button>
                </Field>

                <Field label="Suspension reason">
                  <input
                    value={draft.suspendedReason}
                    onChange={(e) => updateDraft(setDrafts, business.id, 'suspendedReason', e.target.value)}
                    placeholder="Optional support note"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                Business created on {fmtDate(business.createdAt)} • Access until {business.subscriptionEndsAt ? fmtDate(business.subscriptionEndsAt) : 'Not set'}
              </div>
            </Card>
          )
        })}
      </div>

      <div className="mt-6">
        <PaginationBar
          page={data?.page ?? 1}
          totalPages={data?.totalPages ?? 1}
          total={data?.total ?? 0}
          label="businesses"
          onPageChange={setPage}
        />
      </div>
    </SuperAdminShell>
  )
}

function updateDraft(
  setDrafts: Dispatch<SetStateAction<Record<string, BusinessDraft>>>,
  businessId: string,
  key: keyof BusinessDraft,
  value: string | number | null
) {
  setDrafts((current) => ({
    ...current,
    [businessId]: {
      ...current[businessId],
      [key]: value,
    },
  }))
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-200/70 px-4 py-3 dark:border-slate-800">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
