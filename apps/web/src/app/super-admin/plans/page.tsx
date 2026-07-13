'use client'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SuperAdminShell } from '@/components/layout/SuperAdminShell'
import { Badge } from '@/components/ui/Badge'
import { Card, SectionHeader } from '@/components/ui/Card'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'

type PlanName = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'

type PlanLimits = {
  maxUsers: number | null
  maxProducts: number | null
  maxCustomers: number | null
  maxOrdersPerMonth: number | null
  maxInvoicesPerMonth: number | null
  allowExports: boolean
  allowAdvancedReports: boolean
  allowMultipleLocations: boolean
}

type PlanRow = {
  id: string
  name: PlanName
  priceMonthly: number
  priceYearly: number
  description: string | null
  isActive: boolean
  blockedFeatures: string[]
  limits: PlanLimits | null
}

type PlanCatalog = {
  plans: PlanRow[]
  gateableFeatures: Array<{ key: string; label: string }>
}

const LIMIT_FIELDS: Array<{ key: keyof PlanLimits; label: string }> = [
  { key: 'maxUsers', label: 'Max users' },
  { key: 'maxProducts', label: 'Max products' },
  { key: 'maxCustomers', label: 'Max customers' },
  { key: 'maxOrdersPerMonth', label: 'Orders / month' },
  { key: 'maxInvoicesPerMonth', label: 'Invoices / month' },
]

const TOGGLE_FIELDS: Array<{ key: 'allowExports' | 'allowAdvancedReports' | 'allowMultipleLocations'; label: string }> = [
  { key: 'allowExports', label: 'Exports' },
  { key: 'allowAdvancedReports', label: 'Advanced reports' },
  { key: 'allowMultipleLocations', label: 'Multi-location' },
]

const EMPTY_LIMITS: PlanLimits = {
  maxUsers: null,
  maxProducts: null,
  maxCustomers: null,
  maxOrdersPerMonth: null,
  maxInvoicesPerMonth: null,
  allowExports: false,
  allowAdvancedReports: false,
  allowMultipleLocations: false,
}

export default function SuperAdminPlansPage() {
  const qc = useQueryClient()
  const [alert, setAlert] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)

  const catalog = useQuery<PlanCatalog>({
    queryKey: ['super-admin', 'plan-catalog'],
    queryFn: () => api.get('/api/super-admin/plans').then((res) => res.data.data),
  })

  if (catalog.isLoading || !catalog.data) {
    return (
      <SuperAdminShell>
        <PageLoader />
      </SuperAdminShell>
    )
  }

  return (
    <SuperAdminShell>
      <SectionHeader
        eyebrow="Plan catalog"
        title="Plans, limits & features"
        description="Each plan carries its own pricing, usage limits, and feature gates. Business-type settings enable features; a plan block always wins. Changes apply to tenants within seconds."
      />

      {alert ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-2 text-sm ${
            alert.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200'
          }`}
        >
          {alert.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {catalog.data.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            gateableFeatures={catalog.data.gateableFeatures}
            onSaved={(message) => {
              setAlert({ tone: 'success', message })
              qc.invalidateQueries({ queryKey: ['super-admin', 'plan-catalog'] })
            }}
            onError={(message) => setAlert({ tone: 'danger', message })}
          />
        ))}
      </div>
    </SuperAdminShell>
  )
}

function PlanCard({
  plan,
  gateableFeatures,
  onSaved,
  onError,
}: {
  plan: PlanRow
  gateableFeatures: Array<{ key: string; label: string }>
  onSaved: (message: string) => void
  onError: (message: string) => void
}) {
  const [priceMonthly, setPriceMonthly] = useState(String(plan.priceMonthly))
  const [priceYearly, setPriceYearly] = useState(String(plan.priceYearly))
  const [isActive, setIsActive] = useState(plan.isActive)
  const [limits, setLimits] = useState<PlanLimits>(plan.limits ?? EMPTY_LIMITS)
  const [blocked, setBlocked] = useState<Set<string>>(new Set(plan.blockedFeatures))

  useEffect(() => {
    setPriceMonthly(String(plan.priceMonthly))
    setPriceYearly(String(plan.priceYearly))
    setIsActive(plan.isActive)
    setLimits(plan.limits ?? EMPTY_LIMITS)
    setBlocked(new Set(plan.blockedFeatures))
  }, [plan])

  const save = useMutation({
    mutationFn: () =>
      api
        .put(`/api/super-admin/plans/${plan.name}`, {
          priceMonthly: Number(priceMonthly) || 0,
          priceYearly: Number(priceYearly) || 0,
          isActive,
          blockedFeatures: Array.from(blocked),
          limits,
        })
        .then((res) => res.data.data),
    onSuccess: () => onSaved(`${plan.name} plan saved.`),
    onError: (err: any) => onError(err?.response?.data?.error ?? `Failed to save ${plan.name} plan.`),
  })

  function setLimit(key: keyof PlanLimits, raw: string) {
    setLimits((prev) => ({ ...prev, [key]: raw === '' ? null : Math.max(0, Math.floor(Number(raw) || 0)) }))
  }

  return (
    <Card className="flex flex-col">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{plan.name}</div>
        <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'ACTIVE' : 'DISABLED'}</Badge>
      </div>
      {plan.description ? <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">{plan.description}</div> : <div className="mb-3" />}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">₹ / month</div>
          <input type="number" min={0} value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">₹ / year</div>
          <input type="number" min={0} value={priceYearly} onChange={(e) => setPriceYearly(e.target.value)} className={inputCls} />
        </label>
      </div>

      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Usage limits</div>
      <div className="mt-2 space-y-2">
        {LIMIT_FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-300">{field.label}</span>
            <input
              type="number"
              min={0}
              placeholder="∞"
              value={limits[field.key] === null ? '' : String(limits[field.key])}
              onChange={(e) => setLimit(field.key, e.target.value)}
              className={`${inputCls} w-24 text-right`}
            />
          </label>
        ))}
        <div className="text-[10px] text-slate-400 dark:text-slate-500">Blank = unlimited</div>
      </div>

      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Plan features</div>
      <div className="mt-2 space-y-1.5">
        {TOGGLE_FIELDS.map((field) => (
          <label key={field.key} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            {field.label}
            <input
              type="checkbox"
              checked={Boolean(limits[field.key])}
              onChange={(e) => setLimits((prev) => ({ ...prev, [field.key]: e.target.checked }))}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Blocked features</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {gateableFeatures.map((feature) => {
          const isBlocked = blocked.has(feature.key)
          return (
            <button
              key={feature.key}
              type="button"
              title={isBlocked ? `${feature.label}: blocked on this plan` : `${feature.label}: inherited from business setup`}
              onClick={() =>
                setBlocked((prev) => {
                  const next = new Set(prev)
                  if (next.has(feature.key)) next.delete(feature.key)
                  else next.add(feature.key)
                  return next
                })
              }
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                isBlocked
                  ? 'border-rose-300 bg-rose-50 text-rose-700 line-through dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {feature.label}
            </button>
          )
        })}
      </div>
      <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Click to block a feature on this plan; struck-through = blocked.</div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800">
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={isActive}
            disabled={plan.name === 'FREE'}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Plan active
        </label>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          {save.isPending ? 'Saving...' : 'Save plan'}
        </button>
      </div>
    </Card>
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
