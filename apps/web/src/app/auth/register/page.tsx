'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import Link from 'next/link'
import { fmt } from '@/lib/utils'

interface RegistrationConfig {
  trialDays: number
  monthlyPrice: number
  yearlyPrice: number
  currency: string
}

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength)
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [city, setCity] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [address, setAddress] = useState('')
  const [config, setConfig] = useState<RegistrationConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    api.get('/api/auth/registration-config')
      .then((res) => setConfig(res.data.data))
      .catch(() => undefined)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (!/^\d{10}$/.test(onlyDigits(phone, 10))) return setError('Phone number must be exactly 10 digits')
    if (businessPhone && !/^\d{10}$/.test(onlyDigits(businessPhone, 10))) return setError('Business phone must be exactly 10 digits')

    setLoading(true)
    try {
      const res = await api.post('/api/auth/register', {
        name,
        phone: onlyDigits(phone, 10),
        password,
        role: 'OWNER',
        businessName,
        city,
        businessPhone: onlyDigits(businessPhone || phone, 10),
        address,
      })
      login(res.data.data.token, res.data.data.user)
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-[10%] top-[14%] h-52 w-52 rounded-full bg-amber-100/60 blur-3xl dark:bg-amber-500/10" />
        <div className="absolute bottom-[8%] right-[12%] h-60 w-60 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/12" />
      </div>

      <div className="relative grid w-full max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="max-w-xl">
          <div className="mb-3 inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            Cement House
          </div>
          <div className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">Start your free trial</div>
          <div className="mt-3 text-base text-slate-600 dark:text-slate-300">
            Create the owner account and launch your free-trial workspace in seconds.
          </div>

          <div className="mt-8 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Trial summary</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {config ? `${config.trialDays} days free` : 'Free trial'}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              After the trial ends, the workspace locks automatically and the owner is redirected to subscription renewal.
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <PlanTile title="Monthly" price={fmt(config?.monthlyPrice ?? 200)} sub="Good for ongoing local trading operations" />
              <PlanTile title="Yearly" price={fmt(config?.yearlyPrice ?? 2100)} sub="Best value for full-season teams" />
            </div>
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Paid renewal and subscription checkout are handled directly via Razorpay.
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/86 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Business details</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Business name *">
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required placeholder="e.g. Sharma Cement Store" className={inputCls} />
                </Field>
                <Field label="City *">
                  <input value={city} onChange={(e) => setCity(e.target.value)} required placeholder="e.g. Hisar" className={inputCls} />
                </Field>
                <Field label="Business phone">
                  <input value={businessPhone} onChange={(e) => setBusinessPhone(onlyDigits(e.target.value, 10))} placeholder="Optional if same as owner" maxLength={10} className={inputCls} />
                </Field>
                <Field label="Address">
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional business address" className={inputCls} />
                </Field>
              </div>
            </div>

            <div className="border-t border-slate-200/70 pt-5 dark:border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Owner account</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Owner name *">
                  <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ramesh Kumar" className={inputCls} />
                </Field>
                <Field label="Phone number *">
                  <input value={phone} onChange={(e) => setPhone(onlyDigits(e.target.value, 10))} required maxLength={10} placeholder="9876543210" className={inputCls} />
                </Field>
                <Field label="Password *">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min 6 characters" className={inputCls} />
                </Field>
              </div>
            </div>

            {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              {loading ? 'Creating trial workspace...' : `Start ${config?.trialDays ?? 7}-day free trial`}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
              Sign in
            </Link>
          </div>
          <div className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
            Need platform access?{' '}
            <Link href="/auth/admin-setup" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              Create Super Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
      {children}
    </label>
  )
}

function PlanTile({ title, price, sub }: { title: string; price: string; sub: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{price}</div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  )
}

const inputCls =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500'
