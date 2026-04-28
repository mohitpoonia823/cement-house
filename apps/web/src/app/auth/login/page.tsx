'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import Link from 'next/link'
import { fmt } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { LanguageSelect } from '@/components/common/LanguageSelect'

interface RegistrationConfig {
  trialDays: number
  monthlyPrice: number
  yearlyPrice: number
  currency: string
  trialRequiresCard: boolean
  updatedAt?: string | null
}

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<RegistrationConfig | null>(null)
  const { t, language } = useI18n()
  const { login } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    const reason = sessionStorage.getItem('auth_logout_reason') ?? ''
    if (reason) {
      sessionStorage.removeItem('auth_logout_reason')
      setInfo(reason)
    }
    api.get('/api/auth/registration-config', {
      params: { t: Date.now() },
      headers: { 'Cache-Control': 'no-cache' },
    })
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
        setInfo(res.data.data.user.accessReason ?? (language === 'hi' ? 'वर्कस्पेस एक्सेस लॉक है। ओनर के सब्सक्रिप्शन रिन्यू करने तक प्रतीक्षा करें।' : language === 'hinglish' ? 'Workspace access lock hai. Owner subscription renew kare tab tak wait karo.' : 'Workspace access is locked until the owner renews the subscription.'))
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
      setError(err.response?.data?.error ?? (language === 'hi' ? 'लॉगिन विफल। क्रेडेंशियल जांचें।' : language === 'hinglish' ? 'Login fail hua. Credentials check karo.' : 'Login failed. Check credentials.'))
    } finally {
      setLoading(false)
    }
  }

  const languageText = language === 'hi' ? {
    startFreeTrial: 'मुफ़्त ट्रायल शुरू करें',
    daysFree: 'दिन मुफ्त',
    trialText: 'ओनर और बिज़नेस डिटेल से शुरू करें, फिर Razorpay checkout से कभी भी paid plan एक्टिवेट करें।',
    startTrialBtn: 'फ्री ट्रायल शुरू करें',
    renewalReady: 'रिन्यूअल तैयार',
    lockAtExpiry: 'एक्सपायरी पर वर्कस्पेस लॉक हो जाएगा',
    renewalText: 'ट्रायल या प्लान खत्म होते ही ओनर को subscription पेज पर भेजा जाता है, डेटा सुरक्षित रहता है।',
    securePayments: 'सुरक्षित भुगतान सीधे Razorpay checkout में होते हैं।',
    platformLine: 'कंस्ट्रक्शन मटेरियल मैनेजमेंट प्लेटफ़ॉर्म',
    phonePlaceholder: '9876543210',
    passwordPlaceholder: 'अपना पासवर्ड दर्ज करें',
    loginFailed: 'लॉगिन विफल। क्रेडेंशियल जांचें।',
    accessLocked: 'वर्कस्पेस एक्सेस लॉक है। सब्सक्रिप्शन रिन्यू होने तक प्रतीक्षा करें।',
  } : language === 'hinglish' ? {
    startFreeTrial: 'Free trial start karo',
    daysFree: 'din free',
    trialText: 'Owner aur business details se start karo, phir Razorpay checkout se kabhi bhi paid plan activate karo.',
    startTrialBtn: 'Free trial start karo',
    renewalReady: 'Renewal ready',
    lockAtExpiry: 'Expiry pe workspace lock hoga',
    renewalText: 'Trial ya plan khatam hote hi owner ko subscription area me bheja jata hai, data safe rehta hai.',
    securePayments: 'Secure payment direct Razorpay checkout me hota hai.',
    platformLine: 'Construction material management platform',
    phonePlaceholder: '9876543210',
    passwordPlaceholder: 'Apna password daalo',
    loginFailed: 'Login fail hua. Credentials check karo.',
    accessLocked: 'Workspace access lock hai. Subscription renew hone tak wait karo.',
  } : {
    startFreeTrial: 'Start free trial',
    daysFree: 'days free',
    trialText: 'Start with owner and business details, then activate paid plans anytime with Razorpay checkout.',
    startTrialBtn: 'Start a free trial',
    renewalReady: 'Renewal ready',
    lockAtExpiry: 'Workspace locks at expiry',
    renewalText: 'Owners are redirected to the subscription area as soon as trial or plan access ends, while data stays intact.',
    securePayments: 'Secure payments are handled directly in Razorpay checkout.',
    platformLine: 'Construction material management platform',
    phonePlaceholder: '9876543210',
    passwordPlaceholder: 'Enter your password',
    loginFailed: 'Login failed. Check credentials.',
    accessLocked: 'Workspace access is locked until the owner renews the subscription.',
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-[12%] top-[12%] h-48 w-48 rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-500/12" />
        <div className="absolute bottom-[10%] right-[14%] h-56 w-56 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/12" />
      </div>

      <div className="relative grid w-full max-w-6xl gap-10 lg:grid-cols-[0.9fr_0.7fr] lg:items-center">
        <div className="max-w-xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {t('brand.cementHouse')}
            </div>
            <LanguageSelect />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">{t('auth.welcomeBack')}</h1>
          <p className="mt-3 max-w-lg text-base text-slate-600 dark:text-slate-300">
            {t('auth.subtitle')}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[28px] border border-white/70 bg-white/86 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{languageText.startFreeTrial}</div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {config ? `${config.trialDays} ${languageText.daysFree}` : languageText.startFreeTrial}
              </div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {languageText.trialText}
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
                {languageText.startTrialBtn}
              </Link>
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-slate-950/68">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{languageText.renewalReady}</div>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{languageText.lockAtExpiry}</div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {languageText.renewalText}
              </div>
              <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                {languageText.securePayments}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm justify-self-center">
          <div className="rounded-[28px] border border-white/70 bg-white/86 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
            <form onSubmit={handleSubmit} className="space-y-4">
              {info && <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">{info}</div>}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('auth.phone')}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={languageText.phonePlaceholder}
                  maxLength={10}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  required
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('auth.password')}</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400"
                  >
                    {showPassword ? t('auth.hide') : t('auth.show')}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={languageText.passwordPlaceholder}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  required
                />
                <div className="mt-2 text-right">
                  <Link href="/auth/forgot-password" className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400">
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
              </div>
              {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
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
          <div className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
            {t('auth.platformSetup')}{' '}
            <Link href="/auth/admin-setup" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              {t('auth.createSuperAdmin')}
            </Link>
          </div>
          <div className="mt-2 text-center text-xs uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            {languageText.platformLine}
          </div>
        </div>
      </div>
    </div>
  )
}
