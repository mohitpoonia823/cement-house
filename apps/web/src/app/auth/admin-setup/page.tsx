'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'

export default function SuperAdminSetupPage() {
  const router = useRouter()
  const { login } = useAuthStore()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [setupKey, setSetupKey] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('Checking setup availability...')
  const [isAvailable, setIsAvailable] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    api.get('/api/auth/super-admin/setup-status')
      .then((res) => {
        if (!active) return
        const data = res.data.data
        if (!data.configured) {
          setStatusMessage('Super Admin setup is disabled on this server. Add SUPER_ADMIN_SETUP_KEY in the API environment first.')
          setIsAvailable(false)
          return
        }
        if (data.hasSuperAdmin) {
          setStatusMessage('A Super Admin account already exists. Please sign in with that account.')
          setIsAvailable(false)
          return
        }

        setStatusMessage('Bootstrap is enabled. Create the first Super Admin account below.')
        setIsAvailable(true)
      })
      .catch(() => {
        if (!active) return
        setStatusMessage('Unable to check Super Admin setup right now. Please try again.')
        setIsAvailable(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Password must be at least 6 characters')

    setLoading(true)
    try {
      const res = await api.post('/api/auth/super-admin/setup', {
        name,
        phone,
        password,
        setupKey,
      })
      login(res.data.data.token, res.data.data.user)
      router.replace('/super-admin')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create Super Admin account.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f4f7f5_0%,#edf3f0_48%,#ecf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-[10%] top-[12%] h-52 w-52 rounded-full bg-emerald-100/60 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute bottom-[10%] right-[12%] h-60 w-60 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/12" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            Cement House
          </div>
          <div className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Set up Super Admin</div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Create the first platform administrator account from the UI using your bootstrap setup key.
          </div>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/86 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
          <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            {statusMessage}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Full name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Platform Admin"
                required
                disabled={!isAvailable}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Phone number *</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9999999999"
                maxLength={10}
                required
                disabled={!isAvailable}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Password *</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                disabled={!isAvailable}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Setup key *</label>
              <input
                type="password"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                placeholder="Server bootstrap key"
                required
                disabled={!isAvailable}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}

            <button
              type="submit"
              disabled={loading || !isAvailable}
              className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
            >
              {loading ? 'Creating Super Admin...' : 'Create Super Admin'}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
          Already have access?{' '}
          <Link href="/auth/login" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
