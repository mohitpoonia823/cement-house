'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { fmt } from '@/lib/utils'

type RegistrationConfig = {
  trialDays: number
  monthlyPrice: number
  yearlyPrice: number
  currency: string
}

const FALLBACK_PRICING: RegistrationConfig = {
  trialDays: 7,
  monthlyPrice: 200,
  yearlyPrice: 2100,
  currency: 'INR',
}

export default function PricingPage() {
  const [config, setConfig] = useState<RegistrationConfig | null>(null)

  useEffect(() => {
    api
      .get('/api/auth/registration-config', {
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      })
      .then((res) => setConfig(res.data.data as RegistrationConfig))
      .catch(() => undefined)
  }, [])

  const pricing = useMemo(() => {
    const monthly = Number(config?.monthlyPrice ?? 0)
    const yearly = Number(config?.yearlyPrice ?? 0)
    const trialDays = Number(config?.trialDays ?? 0)
    const hasValidAdminPricing = monthly > 0 && yearly > 0
    if (!hasValidAdminPricing) return FALLBACK_PRICING
    return {
      trialDays: trialDays > 0 ? trialDays : FALLBACK_PRICING.trialDays,
      monthlyPrice: monthly,
      yearlyPrice: yearly,
      currency: config?.currency || FALLBACK_PRICING.currency,
    }
  }, [config])

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl dark:bg-sky-500/15" />
        <div className="absolute -right-16 bottom-12 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/15" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:42px_42px] dark:opacity-20" />
      </div>
      <div className="relative mx-auto w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur sm:p-10 dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
        <h1 className="text-3xl font-semibold text-slate-950 dark:text-slate-100 sm:text-4xl">Pricing</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">Simple plans designed for growing teams.</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Monthly</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-100">{fmt(pricing.monthlyPrice)}</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">Billed every month</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Yearly</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-100">{fmt(pricing.yearlyPrice)}</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">Billed every year</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/60">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">How pricing works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>{pricing.trialDays} days free trial</li>
            <li>Monthly and yearly billing options</li>
            <li>Plan-level module and usage limits</li>
            <li>Upgrade/downgrade as your business scales</li>
            <li>Taxes/GST as applicable</li>
          </ul>
        </div>

        <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">
          For current pricing and activation support, contact{' '}
          <a className="text-sky-700 hover:underline dark:text-sky-300" href="mailto:mohitpoonia823@gmail.com">mohitpoonia823@gmail.com</a>.
        </p>

        <Link href="/" className="mt-8 inline-flex rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Back to Home
        </Link>
      </div>
    </main>
  )
}
