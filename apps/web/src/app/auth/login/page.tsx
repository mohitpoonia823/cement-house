'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { LanguageSelect } from '@/components/common/LanguageSelect'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const { t, language } = useI18n()
  const { login } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    const reason = sessionStorage.getItem('auth_logout_reason') ?? ''
    if (reason) {
      sessionStorage.removeItem('auth_logout_reason')
      setInfo(reason)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/login', { phone, password })
      if (res.data.data.user.accessLocked && res.data.data.user.role !== 'OWNER') {
        setInfo(
          res.data.data.user.accessReason ??
            (language === 'hi'
              ? 'Workspace access is locked until the owner renews the subscription.'
              : language === 'hinglish'
              ? 'Workspace access lock hai. Owner subscription renew kare tab tak wait karo.'
              : 'Workspace access is locked until the owner renews the subscription.')
        )
        return
      }
      login(res.data.data.token, res.data.data.user)
      if (res.data.data.user.role === 'SUPER_ADMIN') router.replace('/super-admin')
      else if (res.data.data.user.accessLocked) router.replace('/settings?subscription=required')
      else router.replace('/dashboard')
    } catch (err: any) {
      setError(
        err.response?.data?.error ??
          (language === 'hi'
            ? 'Login failed. Check credentials.'
            : language === 'hinglish'
            ? 'Login fail hua. Credentials check karo.'
            : 'Login failed. Check credentials.')
      )
    } finally {
      setLoading(false)
    }
  }

  const phonePlaceholder = '9876543210'
  const passwordPlaceholder = language === 'hi' ? 'Enter your password' : language === 'hinglish' ? 'Apna password daalo' : 'Enter your password'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-[14%] top-[12%] h-48 w-48 rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-500/12" />
        <div className="absolute bottom-[10%] right-[14%] h-56 w-56 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/12" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-5 flex items-center justify-between sm:mb-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go back"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {t('brand.cementHouse')}
            </Link>
          </div>
          <LanguageSelect />
        </div>

        <div className="rounded-[24px] border border-white/70 bg-white/86 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur sm:rounded-[28px] sm:p-6 dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t('auth.signIn')}</div>
            {info && <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{info}</div>}
            <div>
              <label className="mb-2 block text-[12px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{t('auth.phone')}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={phonePlaceholder}
                maxLength={10}
                className="w-full min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                required
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{t('auth.password')}</label>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? t('auth.hide') : t('auth.show')}
                  title={showPassword ? t('auth.hide') : t('auth.show')}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-sky-600 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-900/20 dark:hover:text-sky-300"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 transition-all duration-200 ${showPassword ? 'scale-100 opacity-100' : 'scale-95 opacity-90'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {showPassword ? (
                      <>
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    ) : (
                      <>
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A12.24 12.24 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.39-1.61" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={passwordPlaceholder}
                className="w-full min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                required
              />
              <div className="mt-2 text-right">
                <Link href="/auth/forgot-password" className="text-[12px] font-semibold text-sky-600 hover:underline dark:text-sky-400">
                  {t('auth.forgotPassword')}
                </Link>
              </div>
            </div>
            {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-12 rounded-2xl bg-slate-950 py-3 text-base font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              {loading ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
          {t('auth.newHere')}{' '}
          <Link href="/auth/register" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
            {t('auth.createAccount')}
          </Link>
        </div>
      </div>
    </div>
  )
}
