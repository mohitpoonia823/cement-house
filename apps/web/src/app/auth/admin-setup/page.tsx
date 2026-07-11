'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { LanguageSelect } from '@/components/common/LanguageSelect'

export default function SuperAdminSetupPage() {
  const router = useRouter()
  const { login } = useAuthStore()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [setupKey, setSetupKey] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('Checking setup availability...')
  const [isAvailable, setIsAvailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const { t, language } = useI18n()

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
        email,
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
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[12%] top-[10%] h-56 w-56 rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute bottom-[8%] right-[12%] h-64 w-64 rounded-full bg-teal-200/40 blur-3xl dark:bg-teal-500/10" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {t('brand.cementHouse')}
            </div>
            <LanguageSelect />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {language === 'hi' ? 'सुपर एडमिन सेटअप' : language === 'hinglish' ? 'Super Admin setup' : 'Set up Super Admin'}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Create the first platform administrator account from the UI using your bootstrap setup key.
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
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
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@cementhouse.com"
                required
                disabled={!isAvailable}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}

            <button
              type="submit"
              disabled={loading || !isAvailable}
              className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (language === 'hi' ? 'सुपर एडमिन बनाया जा रहा है...' : language === 'hinglish' ? 'Super Admin ban raha hai...' : 'Creating Super Admin...') : t('auth.createSuperAdmin')}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
          {language === 'hi' ? 'पहले से एक्सेस है?' : language === 'hinglish' ? 'Already access hai?' : 'Already have access?'}{' '}
          <Link href="/auth/login" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
            {t('auth.signIn')}
          </Link>
        </div>
      </div>
    </div>
  )
}
