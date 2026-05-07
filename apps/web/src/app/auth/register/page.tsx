'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import Link from 'next/link'
import { fmt } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { LanguageSelect } from '@/components/common/LanguageSelect'
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_CONFIG,
  CUSTOM_ONBOARDING_FEATURES,
  CUSTOM_ONBOARDING_MODULES,
  type BusinessType,
} from '@cement-house/utils'

interface RegistrationConfig {
  trialDays: number
  monthlyPrice: number
  yearlyPrice: number
  currency: string
  updatedAt?: string | null
}

type BusinessTypeChoice = {
  key: BusinessType
  label: string
}

type RecommendedPreset = {
  key: BusinessType
  title: string
  subtitle: string
}

const BUSINESS_TYPE_CHOICES: BusinessTypeChoice[] = BUSINESS_TYPES.map((type) => ({
  key: type,
  label: BUSINESS_TYPE_CONFIG[type].label,
}))

const RECOMMENDED_PRESETS: RecommendedPreset[] = [
  { key: 'CEMENT', title: 'Cement', subtitle: 'Bulk billing + transport ready' },
  { key: 'PHARMACY_MEDICAL', title: 'Pharmacy', subtitle: 'Batch + expiry setup' },
  { key: 'KIRYANA_GROCERY', title: 'Grocery', subtitle: 'Fast retail + barcode friendly' },
]

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength)
}

function getCustomDependencyHints(enabledModules: string[], featureFlags: Record<string, boolean>) {
  const hints: string[] = []
  if (enabledModules.length === 0) hints.push('Select at least one core module.')
  if (enabledModules.includes('orders') && !enabledModules.includes('customers')) {
    hints.push('Billing / orders needs Customers module.')
  }
  if (featureFlags.transportManagement && !(enabledModules.includes('deliveries') || enabledModules.includes('logistics'))) {
    hints.push('Transport management needs Delivery or Logistics module.')
  }
  if (featureFlags.restaurantPOS && !(enabledModules.includes('orders') && enabledModules.includes('inventory'))) {
    hints.push('Restaurant POS needs Orders + Inventory modules.')
  }
  if (featureFlags.gstBilling && !enabledModules.includes('orders')) {
    hints.push('GST billing needs Billing / orders module.')
  }
  return hints
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessTypeChoice, setBusinessTypeChoice] = useState<BusinessType>('GENERAL_STORE')
  const [businessType, setBusinessType] = useState<BusinessType>('GENERAL_STORE')
  const [manualTypeLocked, setManualTypeLocked] = useState(false)
  const [dismissedSuggestionName, setDismissedSuggestionName] = useState('')
  const [customBusinessTypeName, setCustomBusinessTypeName] = useState('')
  const [customBusinessDescription, setCustomBusinessDescription] = useState('')
  const [customMode, setCustomMode] = useState<'BASIC' | 'ADVANCED'>('BASIC')
  const [showOptionalConfig, setShowOptionalConfig] = useState(false)
  const [customEnabledModules, setCustomEnabledModules] = useState<string[]>(
    CUSTOM_ONBOARDING_MODULES.filter((m) => m.defaultEnabled).map((m) => m.key),
  )
  const [customFeatureFlags, setCustomFeatureFlags] = useState<Record<string, boolean>>(
    Object.fromEntries(CUSTOM_ONBOARDING_FEATURES.map((f) => [f.key, f.defaultEnabled])),
  )
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
  const customDependencyHints = getCustomDependencyHints(customEnabledModules, customFeatureFlags)

  function handleBusinessTypeChoice(nextChoiceKey: BusinessType) {
    setManualTypeLocked(true)
    setBusinessTypeChoice(nextChoiceKey)
    setBusinessType(nextChoiceKey)
    if (nextChoiceKey !== 'CUSTOM') {
      setCustomBusinessTypeName('')
      setCustomBusinessDescription('')
      setCustomMode('BASIC')
    }
  }

  function applyRecommendedPreset(nextChoiceKey: BusinessType) {
    handleBusinessTypeChoice(nextChoiceKey)
  }

  function suggestBusinessPresetByName(nameValue: string): { type: BusinessType; title: string } | null {
    const text = nameValue.trim().toLowerCase()
    if (!text) return null

    const hasAny = (parts: string[]) => parts.some((p) => text.includes(p))
    if (hasAny(['cement', 'building', 'material'])) return { type: 'CEMENT', title: 'Cement' }
    if (hasAny(['medical', 'pharma', 'clinic', 'medicine'])) return { type: 'PHARMACY_MEDICAL', title: 'Pharmacy' }
    if (hasAny(['kiryana', 'grocery', 'general store'])) return { type: 'KIRYANA_GROCERY', title: 'Grocery' }
    if (hasAny(['cafe', 'restaurant', 'hotel', 'food'])) return { type: 'RESTAURANT_CAFE', title: 'Restaurant / Cafe' }
    return null
  }

  function applySuggestedPreset(nextChoiceKey: BusinessType) {
    setManualTypeLocked(true)
    setBusinessTypeChoice(nextChoiceKey)
    setBusinessType(nextChoiceKey)
    setDismissedSuggestionName('')
    if (nextChoiceKey !== 'CUSTOM') {
      setCustomBusinessTypeName('')
      setCustomBusinessDescription('')
      setCustomMode('BASIC')
    }
  }

  function toggleCustomModule(moduleKey: string) {
    setCustomEnabledModules((prev) =>
      prev.includes(moduleKey) ? prev.filter((key) => key !== moduleKey) : [...prev, moduleKey],
    )
  }

  function toggleCustomFeature(featureKey: string) {
    setCustomFeatureFlags((prev) => ({ ...prev, [featureKey]: !prev[featureKey] }))
  }

  useEffect(() => {
    api
      .get('/api/auth/registration-config', {
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      })
      .then((res) => setConfig(res.data.data))
      .catch(() => undefined)
  }, [])

  const suggestedPreset = suggestBusinessPresetByName(businessName)
  const canShowSuggestion =
    Boolean(suggestedPreset) &&
    !manualTypeLocked &&
    businessName.trim().length >= 4 &&
    dismissedSuggestionName !== businessName.trim().toLowerCase() &&
    businessTypeChoice !== suggestedPreset?.type

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6)
      return setError(tr('Password must be at least 6 characters', 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए', 'Password kam se kam 6 characters ka hona chahiye'))
    if (!/^\d{10}$/.test(onlyDigits(phone, 10)))
      return setError(tr('Phone number must be exactly 10 digits', 'फोन नंबर ठीक 10 अंकों का होना चाहिए', 'Phone number exactly 10 digits ka hona chahiye'))
    if (businessPhone && !/^\d{10}$/.test(onlyDigits(businessPhone, 10)))
      return setError(tr('Business phone must be exactly 10 digits', 'बिज़नेस फोन ठीक 10 अंकों का होना चाहिए', 'Business phone exactly 10 digits ka hona chahiye'))
    if (businessType === 'CUSTOM' && customBusinessTypeName.trim().length < 2)
      return setError(tr('Custom business type name is required', 'कस्टम बिज़नेस टाइप नाम आवश्यक है', 'Custom business type name required hai'))
    if (businessType === 'CUSTOM' && customEnabledModules.length === 0)
      return setError(tr('Select at least one module', 'कम से कम एक मॉड्यूल चुनें', 'Kam se kam ek module select karo'))
    if (
      businessType === 'CUSTOM' &&
      customEnabledModules.includes('orders') &&
      !customEnabledModules.includes('customers')
    ) {
      return setError(
        tr(
          'Customers module is required when billing/orders is enabled',
          'बिलिंग/ऑर्डर मॉड्यूल के साथ कस्टमर मॉड्यूल आवश्यक है',
          'Billing/orders ke saath customers module required hai',
        ),
      )
    }
    if (
      businessType === 'CUSTOM' &&
      customFeatureFlags.transportManagement &&
      !(customEnabledModules.includes('deliveries') || customEnabledModules.includes('logistics'))
    ) {
      return setError(
        tr(
          'Enable delivery/transport module for transport management',
          'ट्रांसपोर्ट मैनेजमेंट के लिए डिलीवरी/ट्रांसपोर्ट मॉड्यूल सक्षम करें',
          'Transport management ke liye delivery/transport module enable karo',
        ),
      )
    }
    if (
      businessType === 'CUSTOM' &&
      customFeatureFlags.restaurantPOS &&
      !(customEnabledModules.includes('orders') && customEnabledModules.includes('inventory'))
    ) {
      return setError(
        tr(
          'Restaurant POS requires orders and inventory modules',
          'रेस्टोरेंट POS के लिए ऑर्डर और इन्वेंटरी मॉड्यूल जरूरी हैं',
          'Restaurant POS ke liye orders aur inventory modules zaroori hain',
        ),
      )
    }
    if (
      businessType === 'CUSTOM' &&
      customFeatureFlags.gstBilling &&
      !customEnabledModules.includes('orders')
    ) {
      return setError(
        tr(
          'GST billing requires billing/orders module',
          'GST बिलिंग के लिए बिलिंग/ऑर्डर मॉड्यूल जरूरी है',
          'GST billing ke liye billing/orders module zaroori hai',
        ),
      )
    }

    setLoading(true)
    try {
      const res = await api.post('/api/auth/register', {
        name,
        phone: onlyDigits(phone, 10),
        email,
        password,
        role: 'OWNER',
        businessName,
        businessType,
        customBusinessTypeName: businessType === 'CUSTOM' ? customBusinessTypeName.trim() : undefined,
        customBusinessDescription:
          businessType === 'CUSTOM' && customBusinessDescription.trim()
            ? customBusinessDescription.trim()
            : undefined,
        enabledModules: businessType === 'CUSTOM' ? customEnabledModules : undefined,
        featureFlags: businessType === 'CUSTOM' ? customFeatureFlags : undefined,
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
    <div className="relative flex min-h-screen items-start justify-center overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-6 sm:items-center sm:py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute left-[10%] top-[14%] h-52 w-52 rounded-full bg-amber-100/60 blur-3xl dark:bg-amber-500/10" />
        <div className="absolute bottom-[8%] right-[12%] h-60 w-60 rounded-full bg-sky-200/55 blur-3xl dark:bg-sky-500/12" />
      </div>

      <div className="relative grid w-full max-w-6xl gap-6 sm:gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-10">
        <div className="max-w-xl">
          <div className="mb-4 flex items-center justify-between">
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
          <div className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
            {tr('Start your free trial', 'अपना मुफ्त ट्रायल शुरू करें', 'Apna free trial start karo')}
          </div>
          <div className="mt-3 max-w-[40ch] text-[15px] leading-6 text-slate-600 sm:text-base dark:text-slate-300">
            {tr(
              'Create the owner account and launch your free-trial workspace in seconds.',
              'ओनर अकाउंट बनाएं और कुछ सेकंड में अपना फ्री-ट्रायल वर्कस्पेस शुरू करें।',
              'Owner account banao aur kuch seconds me free-trial workspace start karo.'
            )}
          </div>

          <div className="mt-6 rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur sm:mt-8 sm:rounded-[32px] sm:p-6 dark:border-white/10 dark:bg-slate-950/72">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{tr('Trial summary', 'ट्रायल सारांश', 'Trial summary')}</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
              {config ? `${config.trialDays} ${tr('days free', 'दिन मुफ्त', 'din free')}` : tr('Free trial', 'मुफ्त ट्रायल', 'Free trial')}
            </div>
            <div className="mt-2 text-[13px] leading-5 text-slate-600 sm:text-sm dark:text-slate-300">
              {tr(
                'After the trial ends, the workspace locks automatically and the owner is redirected to subscription renewal.',
                'ट्रायल खत्म होने के बाद वर्कस्पेस अपने आप लॉक हो जाएगा और ओनर को सब्सक्रिप्शन रिन्यूअल पर भेजा जाएगा।',
                'Trial khatam hone ke baad workspace auto-lock hoga aur owner subscription renewal par redirect hoga.'
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <PlanTile title={tr('Monthly', 'मंथली', 'Monthly')} price={fmt(config?.monthlyPrice ?? 0)} sub={tr('Good for ongoing local trading operations', 'लगातार स्थानीय ट्रेडिंग ऑपरेशंस के लिए बेहतर', 'Ongoing local trading operations ke liye sahi')} />
              <PlanTile title={tr('Yearly', 'ईयरली', 'Yearly')} price={fmt(config?.yearlyPrice ?? 0)} sub={tr('Best value for full-season teams', 'पूरे सीजन के लिए सबसे बेहतर वैल्यू', 'Full-season teams ke liye best value')} />
            </div>
            <div className="mt-4 text-[11px] leading-5 text-slate-500 sm:text-xs dark:text-slate-400">
              {tr('Paid renewal and subscription checkout are handled directly via Razorpay.', 'पेड रिन्यूअल और सब्सक्रिप्शन चेकआउट सीधे Razorpay से होता है।', 'Paid renewal aur subscription checkout direct Razorpay se hota hai.')}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/70 bg-white/86 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur sm:rounded-[28px] sm:p-6 dark:border-white/10 dark:bg-slate-950/72 dark:shadow-[0_24px_60px_rgba(2,6,23,0.40)]">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{tr('Business details', 'बिज़नेस डिटेल्स', 'Business details')}</div>
              <div className="mt-3">
                <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {tr('Recommended setup', 'रिकमेंडेड सेटअप', 'Recommended setup')}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {RECOMMENDED_PRESETS.map((preset) => {
                    const active = businessTypeChoice === preset.key
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyRecommendedPreset(preset.key)}
                        className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                          active
                            ? 'border-sky-500 bg-sky-50 text-slate-900 ring-2 ring-sky-200 dark:border-sky-400 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-900/50'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                        }`}
                      >
                        <div className="text-[15px] font-semibold leading-5">{preset.title}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{preset.subtitle}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label={tr('Business name *', 'बिज़नेस नाम *', 'Business name *')}>
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required placeholder={tr('e.g. Sharma Trading Store', 'जैसे: शर्मा ट्रेडिंग स्टोर', 'e.g. Sharma Trading Store')} className={inputCls} />
                </Field>
                {canShowSuggestion && suggestedPreset ? (
                  <div className="md:col-span-2 rounded-2xl border border-sky-300/60 bg-sky-50/90 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/30 dark:bg-sky-950/25 dark:text-sky-100">
                    <div className="font-medium">
                      {tr(
                        `We detected this might be a ${suggestedPreset.title} business. Apply preset?`,
                        `लगता है यह ${suggestedPreset.title} बिज़नेस हो सकता है। प्रीसेट लागू करें?`,
                        `Lagta hai yeh ${suggestedPreset.title} business ho sakta hai. Preset apply karein?`,
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => applySuggestedPreset(suggestedPreset.type)}
                        className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950"
                      >
                        {tr(`Apply ${suggestedPreset.title} Setup`, `${suggestedPreset.title} सेटअप लागू करें`, `Apply ${suggestedPreset.title} setup`)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedSuggestionName(businessName.trim().toLowerCase())}
                        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      >
                        {tr('Ignore', 'नज़रअंदाज़ करें', 'Ignore')}
                      </button>
                    </div>
                  </div>
                ) : null}
                <Field label={tr('City *', 'शहर *', 'City *')}>
                  <input value={city} onChange={(e) => setCity(e.target.value)} required placeholder={tr('e.g. Hisar', 'जैसे: हिसार', 'e.g. Hisar')} className={inputCls} />
                </Field>
                <Field label={tr('Business type *', 'बिज़नेस टाइप *', 'Business type *')}>
                  <select value={businessTypeChoice} onChange={(e) => handleBusinessTypeChoice(e.target.value as BusinessType)} className={inputCls}>
                    {BUSINESS_TYPE_CHOICES.map((choice) => (
                      <option key={choice.key} value={choice.key}>{choice.label}</option>
                    ))}
                  </select>
                </Field>
                {businessType === 'CUSTOM' ? (
                  <>
                    <Field label={tr('Custom type name *', 'कस्टम टाइप नाम *', 'Custom type name *')}>
                      <input
                        value={customBusinessTypeName}
                        onChange={(e) => setCustomBusinessTypeName(e.target.value)}
                        placeholder={tr('e.g. Pharmacy', 'जैसे: फार्मेसी', 'e.g. Pharmacy')}
                        className={inputCls}
                        required
                      />
                    </Field>
                  </>
                ) : null}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowOptionalConfig((prev) => !prev)}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  {showOptionalConfig
                    ? tr('Hide optional details', 'वैकल्पिक डिटेल्स छुपाएं', 'Optional details hide karo')
                    : tr('Add optional details', 'वैकल्पिक डिटेल्स जोड़ें', 'Optional details add karo')}
                </button>
                {showOptionalConfig ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {businessType === 'CUSTOM' ? (
                      <Field label={tr('Custom description', 'कस्टम विवरण', 'Custom description')}>
                        <input
                          value={customBusinessDescription}
                          onChange={(e) => setCustomBusinessDescription(e.target.value)}
                          placeholder={tr('What kind of shop or service?', 'यह किस तरह का बिज़नेस है?', 'Yeh kis type ka business hai?')}
                          className={inputCls}
                        />
                      </Field>
                    ) : null}
                    <Field label={tr('Business phone', 'बिज़नेस फोन', 'Business phone')}>
                      <input value={businessPhone} onChange={(e) => setBusinessPhone(onlyDigits(e.target.value, 10))} placeholder={tr('Optional if same as owner', 'यदि ओनर जैसा हो तो वैकल्पिक', 'Owner ke jaisa ho to optional')} maxLength={10} className={inputCls} />
                    </Field>
                    <Field label={tr('Address', 'पता', 'Address')}>
                      <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={tr('Optional business address', 'वैकल्पिक बिज़नेस पता', 'Optional business address')} className={inputCls} />
                    </Field>
                  </div>
                ) : null}
              </div>
            </div>

            {businessType === 'CUSTOM' ? (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    {tr('Custom setup mode', 'कस्टम सेटअप मोड', 'Custom setup mode')}
                  </div>
                  <div className="inline-flex rounded-full border border-slate-300 p-1 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setCustomMode('BASIC')}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${customMode === 'BASIC' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                      {tr('Basic', 'बेसिक', 'Basic')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomMode('ADVANCED')}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${customMode === 'ADVANCED' ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                      {tr('Advanced', 'एडवांस्ड', 'Advanced')}
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {customMode === 'BASIC'
                    ? tr('Basic mode keeps setup fast with recommended defaults. You can edit detailed features later in Settings.', 'बेसिक मोड तेज सेटअप देता है। डिटेल्ड फीचर्स बाद में सेटिंग्स से बदल सकते हैं।', 'Basic mode fast setup deta hai. Detailed features baad me settings me edit kar sakte ho.')
                    : tr('Advanced mode lets you fine-tune feature flags now.', 'एडवांस्ड मोड में आप फीचर फ्लैग अभी सेट कर सकते हैं।', 'Advanced mode me aap feature flags abhi set kar sakte ho.')}
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                  {tr('Custom modules & features', 'कस्टम मॉड्यूल और फीचर्स', 'Custom modules aur features')}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {tr('Select modules', 'मॉड्यूल चुनें', 'Modules select karo')}
                    </div>
                    <div className="grid gap-2">
                      {CUSTOM_ONBOARDING_MODULES.map((module) => (
                        <label key={module.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={customEnabledModules.includes(module.key)}
                            onChange={() => toggleCustomModule(module.key)}
                          />
                          <span>{module.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {customMode === 'ADVANCED' ? (
                    <div>
                    <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {tr('Select feature flags', 'फीचर फ्लैग चुनें', 'Feature flags select karo')}
                    </div>
                    <div className="grid gap-2">
                      {CUSTOM_ONBOARDING_FEATURES.map((feature) => (
                        <label key={feature.key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={Boolean(customFeatureFlags[feature.key])}
                            onChange={() => toggleCustomFeature(feature.key)}
                          />
                          <span>{feature.label}</span>
                        </label>
                      ))}
                    </div>
                    </div>
                  ) : null}
                </div>
                {customDependencyHints.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50/90 p-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/25 dark:text-amber-200">
                    {customDependencyHints.map((hint) => (
                      <div key={hint}>• {hint}</div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-emerald-300/60 bg-emerald-50/90 p-3 text-xs text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/25 dark:text-emerald-200">
                    • Setup looks good.
                  </div>
                )}
              </div>
            ) : null}

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

            <div className="sticky bottom-2 z-10 -mx-1 rounded-2xl border border-slate-200/90 bg-white px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:static sm:bottom-auto sm:mx-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none dark:border-slate-800 dark:bg-slate-950 sm:dark:bg-transparent">
              {error && <div className="mb-3 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-950 py-3.5 text-base font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                {loading
                  ? tr('Creating trial workspace...', 'ट्रायल वर्कस्पेस बनाया जा रहा है...', 'Trial workspace create ho raha hai...')
                  : config
                    ? `${tr('Start', 'शुरू करें', 'Start')} ${config.trialDays}-${tr('day free trial', 'दिन का फ्री ट्रायल', 'day free trial')}`
                    : tr('Start free trial', 'फ्री ट्रायल शुरू करें', 'Free trial start karo')}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
            {tr('Already have an account?', 'पहले से अकाउंट है?', 'Already account hai?')}{' '}
            <Link href="/auth/login" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
              {t('auth.signIn')}
            </Link>
          </div>
          <div className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
            {tr('Need platform access?', 'प्लेटफॉर्म एक्सेस चाहिए?', 'Platform access chahiye?')}{' '}
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
      <div className="mb-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400">{label}</div>
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
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500'

