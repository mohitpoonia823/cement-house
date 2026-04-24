'use client'
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { PaginationBar } from '@/components/super-admin/PaginationBar'
import { Badge, statusBadge } from '@/components/ui/Badge'
import { Card, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { useSuperAdminBusinesses, type BusinessListItem } from '@/lib/super-admin'
import { api } from '@/lib/api'
import { fmt, fmtDate } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'

type BusinessDraft = {
  subscriptionPlan: BusinessListItem['subscriptionPlan']
  subscriptionStatus: BusinessListItem['subscriptionStatus']
  monthlySubscriptionAmount: number
  suspendedReason: string
}

export default function SuperAdminBusinessesPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { startImpersonation } = useAuthStore()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('')
  const [drafts, setDrafts] = useState<Record<string, BusinessDraft>>({})

  const { data, isLoading } = useSuperAdminBusinesses({ page, pageSize: 6, search, status })

  useEffect(() => {
    if (!data?.items) return
    const next = Object.fromEntries(
      data.items.map((business) => [
        business.id,
        {
          subscriptionPlan: business.subscriptionPlan,
          subscriptionStatus: business.subscriptionStatus,
          monthlySubscriptionAmount: business.monthlySubscriptionAmount,
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

  const impersonate = useMutation({
    mutationFn: (businessId: string) => api.post(`/api/super-admin/businesses/${businessId}/impersonate`).then((res) => res.data.data),
    onSuccess: (session) => {
      startImpersonation(session.token, session.user)
      router.replace('/dashboard')
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
        <div className="grid gap-4 xl:grid-cols-[1.5fr_0.9fr_auto]">
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

                <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
                  <MiniStat label="GMV" value={fmt(business.gmv)} />
                  <MiniStat label="Outstanding" value={fmt(business.outstanding)} />
                  <MiniStat label="MRR" value={fmt(business.monthlySubscriptionAmount)} />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1.25fr_auto]">
                <Field label="Plan">
                  <select
                    value={draft.subscriptionPlan}
                    onChange={(e) => updateDraft(setDrafts, business.id, 'subscriptionPlan', e.target.value)}
                    className={inputCls}
                  >
                    <option value="STARTER">Starter</option>
                    <option value="PRO">Pro</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </Field>

                <Field label="Billing status">
                  <select
                    value={draft.subscriptionStatus}
                    onChange={(e) => updateDraft(setDrafts, business.id, 'subscriptionStatus', e.target.value)}
                    className={inputCls}
                  >
                    <option value="TRIAL">Trial</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PAST_DUE">Past due</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </Field>

                <Field label="Monthly fee">
                  <input
                    type="number"
                    min={0}
                    value={draft.monthlySubscriptionAmount}
                    onChange={(e) => updateDraft(setDrafts, business.id, 'monthlySubscriptionAmount', Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>

                <Field label="Suspension reason">
                  <input
                    value={draft.suspendedReason}
                    onChange={(e) => updateDraft(setDrafts, business.id, 'suspendedReason', e.target.value)}
                    placeholder="Optional support note"
                    className={inputCls}
                  />
                </Field>

                <div className="flex flex-wrap items-end gap-2">
                  <button
                    onClick={() =>
                      updateBusiness.mutate({
                        id: business.id,
                        payload: {
                          subscriptionPlan: draft.subscriptionPlan,
                          subscriptionStatus: draft.subscriptionStatus,
                          monthlySubscriptionAmount: draft.monthlySubscriptionAmount,
                          suspendedReason: draft.suspendedReason || null,
                        },
                      })
                    }
                    disabled={updateBusiness.isPending}
                    className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
                  >
                    Save billing
                  </button>
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
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {business.isActive ? 'Suspend' : 'Reactivate'}
                  </button>
                  <button
                    onClick={() => impersonate.mutate(business.id)}
                    disabled={impersonate.isPending}
                    className="rounded-full border border-emerald-200 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:opacity-60 dark:border-emerald-500/30 dark:text-emerald-200"
                  >
                    {impersonate.isPending ? 'Starting...' : 'Impersonate'}
                  </button>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-400 dark:text-slate-500">Business created on {fmtDate(business.createdAt)}</div>
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
  value: string | number
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
