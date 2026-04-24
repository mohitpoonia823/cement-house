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
  trialRequiresCard: boolean
}

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<RegistrationConfig | null>(null)
  const { login } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    const reason = sessionStorage.getItem('auth_logout_reason') ?? ''
    if (reason) {
      sessionStorage.removeItem('auth_logout_reason')
      setInfo(reason)
    }
    api.get('/api/auth/registration-config')
      .then((res) => setConfig(res.data.data))
      .catch(() => undefined)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', { phone, password })
      if (res.data.data.user.accessLocked && res.data.data.user.role !== 'OWNER') {
        setInfo(res.data.data.user.accessReason ?? 'Workspace access is locked until the owner renews the subscription.')
        return
      }
      login(res.data.data.token, res.data.data.user)
      if (res.data.data.user.role === 'SUPER_ADMIN') {
        router.replace('/super-admin')
      } else if (res.data.data.user.accessLocked) {
        router.replace('/settings?subscription=required')
      } else {
        router.replace('/dashboard')
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed. Check credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-[12%] top-[12%] h-48 w-48 rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-500/12" />
        <div className="absolute bottom-[10%] right-[14%] h-56 w-56 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/12" />
      </div>

      <div className="relative grid w-full max-w-6xl gap-10 lg:grid-cols-[0.9fr_0.7fr] lg:items-center">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            Cement House
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">Welcome back</h1>
          <p className="mt-3 max-w-lg text-base text-slate-600 dark:text-slate-300">
            Sign in to continue managing orders, collections, stock, and subscription access from one workspace.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[28px] border border-white/70 bg-white/86 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Start free trial</div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {config ? `${config.trialDays} days free` : 'Free trial'}
              </div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Start with owner and business details, then activate paid plans anytime with Razorpay checkout.
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900/70">
                  Monthly {fmt(config?.monthlyPrice ?? 200)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900/70">
                  Yearly {fmt(config?.yearlyPrice ?? 2100)}
                </span>
              </div>
              <Link
                href="/auth/register"
                className="mt-5 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                Start a free trial
              </Link>
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-slate-950/68">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Renewal ready</div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Workspace locks at expiry</div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Owners are redirected to the subscription area as soon as trial or plan access ends, while data stays intact.
              </div>
              <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Secure payments are handled directly in Razorpay checkout.
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm justify-self-center">
          <div className="rounded-[28px] border border-white/70 bg-white/86 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
            <form onSubmit={handleSubmit} className="space-y-4">
              {info && <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{info}</div>}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Phone number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  maxLength={10}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  required
                />
              </div>
              {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>

          <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
            New here?{' '}
            <Link href="/auth/register" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
              Create an account
            </Link>
          </div>
          <div className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
            Platform setup?{' '}
            <Link href="/auth/admin-setup" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              Create Super Admin
            </Link>
          </div>
          <div className="mt-2 text-center text-xs uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            Construction material management platform
          </div>
        </div>
      </div>
    </div>
  )
}
