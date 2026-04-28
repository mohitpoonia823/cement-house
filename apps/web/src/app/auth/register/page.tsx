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
  updatedAt?: string | null
}

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength)
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [city, setCity] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [address, setAddress] = useState('')
  const [config, setConfig] = useState<RegistrationConfig | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { t, language } = useI18n()
  const tr = (en: string, hi: string, hinglish?: string) =>
    language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en
  const { login } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    api
      .get('/api/auth/registration-config', {
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      })
      .then((res) => setConfig(res.data.data))
      .catch(() => undefined)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6)
      return setError(tr('Password must be at least 6 characters', 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए', 'Password kam se kam 6 characters ka hona chahiye'))
    if (!/^\d{10}$/.test(onlyDigits(phone, 10)))
      return setError(tr('Phone number must be exactly 10 digits', 'फोन नंबर ठीक 10 अंकों का होना चाहिए', 'Phone number exactly 10 digits ka hona chahiye'))
    if (businessPhone && !/^\d{10}$/.test(onlyDigits(businessPhone, 10)))
      return setError(tr('Business phone must be exactly 10 digits', 'बिज़नेस फोन ठीक 10 अंकों का होना चाहिए', 'Business phone exactly 10 digits ka hona chahiye'))

    setLoading(true)
    try {
      const res = await api.post('/api/auth/register', {
        name,
        phone: onlyDigits(phone, 10),
        email,
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
      setError(err.response?.data?.error ?? tr('Registration failed. Try again.', 'रजिस्ट्रेशन विफल रहा। फिर से प्रयास करें।', 'Registration failed. Dobara try karo.'))
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
          <div className="mb-3 flex items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {t('brand.cementHouse')}
            </div>
            <LanguageSelect />
          </div>
          <div className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {tr('Start your free trial', 'अपना मुफ्त ट्रायल शुरू करें', 'Apna free trial start karo')}
          </div>
          <div className="mt-3 text-base text-slate-600 dark:text-slate-300">
            {tr(
              'Create the owner account and launch your free-trial workspace in seconds.',
              'ओनर अकाउंट बनाएं और कुछ सेकंड में अपना फ्री-ट्रायल वर्कस्पेस शुरू करें।',
              'Owner account banao aur kuch seconds me free-trial workspace start karo.'
            )}
          </div>

          <div className="mt-8 rounded-[32px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr('Trial summary', 'ट्रायल सारांश', 'Trial summary')}</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {config ? `${config.trialDays} ${tr('days free', 'दिन मुफ्त', 'din free')}` : tr('Free trial', 'मुफ्त ट्रायल', 'Free trial')}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {tr(
                'After the trial ends, the workspace locks automatically and the owner is redirected to subscription renewal.',
                'ट्रायल खत्म होने के बाद वर्कस्पेस अपने आप लॉक हो जाएगा और ओनर को सब्सक्रिप्शन रिन्यूअल पर भेजा जाएगा।',
                'Trial khatam hone ke baad workspace auto-lock hoga aur owner subscription renewal par redirect hoga.'
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <PlanTile title={tr('Monthly', 'मंथली', 'Monthly')} price={fmt(config?.monthlyPrice ?? 200)} sub={tr('Good for ongoing local trading operations', 'लगातार स्थानीय ट्रेडिंग ऑपरेशंस के लिए बेहतर', 'Ongoing local trading operations ke liye sahi')} />
              <PlanTile title={tr('Yearly', 'ईयरली', 'Yearly')} price={fmt(config?.yearlyPrice ?? 2100)} sub={tr('Best value for full-season teams', 'पूरे सीज़न के लिए सबसे बेहतर वैल्यू', 'Full-season teams ke liye best value')} />
            </div>
            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              {tr('Paid renewal and subscription checkout are handled directly via Razorpay.', 'पेड रिन्यूअल और सब्सक्रिप्शन चेकआउट सीधे Razorpay से होता है।', 'Paid renewal aur subscription checkout direct Razorpay se hota hai.')}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/86 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{tr('Business details', 'बिज़नेस डिटेल्स', 'Business details')}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label={tr('Business name *', 'बिज़नेस नाम *', 'Business name *')}>
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required placeholder={tr('e.g. Sharma Cement Store', 'जैसे: शर्मा सीमेंट स्टोर', 'e.g. Sharma Cement Store')} className={inputCls} />
                </Field>
                <Field label={tr('City *', 'शहर *', 'City *')}>
                  <input value={city} onChange={(e) => setCity(e.target.value)} required placeholder={tr('e.g. Hisar', 'जैसे: हिसार', 'e.g. Hisar')} className={inputCls} />
                </Field>
                <Field label={tr('Business phone', 'बिज़नेस फोन', 'Business phone')}>
                  <input value={businessPhone} onChange={(e) => setBusinessPhone(onlyDigits(e.target.value, 10))} placeholder={tr('Optional if same as owner', 'यदि ओनर जैसा हो तो वैकल्पिक', 'Owner ke jaisa ho to optional')} maxLength={10} className={inputCls} />
                </Field>
                <Field label={tr('Address', 'पता', 'Address')}>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={tr('Optional business address', 'वैकल्पिक बिज़नेस पता', 'Optional business address')} className={inputCls} />
                </Field>
              </div>
            </div>

            <div className="border-t border-slate-200/70 pt-5 dark:border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{tr('Owner account', 'ओनर अकाउंट', 'Owner account')}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label={tr('Owner name *', 'ओनर नाम *', 'Owner name *')}>
                  <input value={name} onChange={(e) => setName(e.target.value)} required placeholder={tr('Ramesh Kumar', 'रमेश कुमार', 'Ramesh Kumar')} className={inputCls} />
                </Field>
                <Field label={tr('Phone number *', 'फोन नंबर *', 'Phone number *')}>
                  <input value={phone} onChange={(e) => setPhone(onlyDigits(e.target.value, 10))} required maxLength={10} placeholder="9876543210" className={inputCls} />
                </Field>
                <Field label={tr('Email *', 'ईमेल *', 'Email *')}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="owner@business.com" className={inputCls} />
                </Field>
                <Field label={tr('Password *', 'पासवर्ड *', 'Password *')}>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder={tr('Min 6 characters', 'कम से कम 6 अक्षर', 'Min 6 characters')} className={inputCls} />
                </Field>
              </div>
            </div>

            {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              {loading
                ? tr('Creating trial workspace...', 'ट्रायल वर्कस्पेस बनाया जा रहा है...', 'Trial workspace create ho raha hai...')
                : config
                  ? `${tr('Start', 'शुरू करें', 'Start')} ${config.trialDays}-${tr('day free trial', 'दिन का फ्री ट्रायल', 'day free trial')}`
                  : tr('Start free trial', 'फ्री ट्रायल शुरू करें', 'Free trial start karo')}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
            {tr('Already have an account?', 'पहले से अकाउंट है?', 'Already account hai?')}{' '}
            <Link href="/auth/login" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
              {t('auth.signIn')}
            </Link>
          </div>
          <div className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
            {tr('Need platform access?', 'प्लेटफ़ॉर्म एक्सेस चाहिए?', 'Platform access chahiye?')}{' '}
            <Link href="/auth/admin-setup" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              {t('auth.createSuperAdmin')}
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
