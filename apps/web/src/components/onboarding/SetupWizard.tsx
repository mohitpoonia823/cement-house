'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'
import { useQueryClient } from '@tanstack/react-query'
import { businessTerms } from '@/lib/business-terms'

/**
 * First-run setup wizard. Shown on the dashboard only while the business's
 * defaultSettings.onboarding.pending flag (stamped at registration) is true;
 * completing or skipping clears the flag server-side, so it never reappears —
 * on this device or any other.
 */
export function SetupWizard() {
  const { user, token, login } = useAuthStore()
  const { tr } = useI18n()
  const qc = useQueryClient()
  const [step, setStep] = useState(0)
  const [gstEnabled, setGstEnabled] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seededItems, setSeededItems] = useState<string[] | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closed, setClosed] = useState(false)

  const pending = (user?.defaultSettings as any)?.onboarding?.pending === true
  const terms = useMemo(() => businessTerms(user?.businessType as any, user?.customLabels as any), [user])

  if (!user || user.role !== 'OWNER' || !pending || closed) return null

  async function complete(skipped: boolean) {
    if (!token || !user) return
    setFinishing(true)
    setError(null)
    try {
      const payload = skipped ? { skipped: true } : { gstBilling: gstEnabled, skipped: false }
      const data = await api.post('/api/settings/onboarding/complete', payload).then((r) => r.data.data)
      login(token, {
        ...user,
        defaultSettings: data?.defaultSettings ?? user.defaultSettings,
        featureFlags: (data?.featureFlags as Record<string, boolean> | undefined) ?? user.featureFlags,
      })
      qc.invalidateQueries({ queryKey: ['settings-bootstrap'] })
      setClosed(true)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? tr('Something went wrong. Please try again.', 'कुछ गलत हुआ। कृपया फिर से प्रयास करें।'))
    } finally {
      setFinishing(false)
    }
  }

  async function seedSamples() {
    setSeeding(true)
    setError(null)
    try {
      const data = await api.post('/api/settings/onboarding/seed-samples', {}).then((r) => r.data.data)
      setSeededItems(Array.isArray(data?.materials) ? data.materials : [])
      qc.invalidateQueries()
      setStep(3)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? tr('Could not add sample items.', 'सैंपल आइटम नहीं जोड़े जा सके।'))
    } finally {
      setSeeding(false)
    }
  }

  const primaryBtn =
    'rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'
  const secondaryBtn =
    'rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {tr('Workspace setup', 'वर्कस्पेस सेटअप')} · {step + 1}/4
        </div>

        {step === 0 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {tr(`Welcome, ${user.businessName ?? 'there'}!`, `स्वागत है, ${user.businessName ?? ''}!`)}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {tr(
                'Two quick questions and a head start — under a minute, and you can change everything later in Settings.',
                'दो छोटे सवाल और एक शुरुआत — एक मिनट से कम, और सब कुछ बाद में सेटिंग्स में बदला जा सकता है।',
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className={primaryBtn}>
                {tr('Start setup', 'सेटअप शुरू करें')}
              </button>
              <button onClick={() => complete(true)} disabled={finishing} className={secondaryBtn}>
                {finishing ? tr('Closing...', 'बंद हो रहा है...') : tr('Skip for now', 'अभी छोड़ें')}
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {tr('Do you bill with GST?', 'क्या आप GST के साथ बिल बनाते हैं?')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {tr(
                'With GST on, invoices include GSTIN, HSN codes and tax breakup. You can switch this anytime in Settings.',
                'GST चालू होने पर बिल में GSTIN, HSN कोड और टैक्स विवरण शामिल होगा। इसे कभी भी सेटिंग्स में बदल सकते हैं।',
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setGstEnabled(true)}
                className={`rounded-2xl border p-3 text-sm font-medium ${gstEnabled ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300'}`}
              >
                {tr('Yes, GST billing', 'हाँ, GST बिलिंग')}
              </button>
              <button
                onClick={() => setGstEnabled(false)}
                className={`rounded-2xl border p-3 text-sm font-medium ${!gstEnabled ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300'}`}
              >
                {tr('No, simple billing', 'नहीं, साधारण बिलिंग')}
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className={primaryBtn}>
                {tr('Next', 'आगे')}
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {tr(`Add example ${terms.material.toLowerCase()}s?`, 'उदाहरण आइटम जोड़ें?')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {tr(
                'We can add a few items typical for your business so you can try billing right away. Edit or delete them anytime.',
                'हम आपके व्यवसाय के अनुसार कुछ आइटम जोड़ सकते हैं ताकि आप तुरंत बिलिंग आज़मा सकें। इन्हें कभी भी बदल या हटा सकते हैं।',
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={seedSamples} disabled={seeding} className={primaryBtn}>
                {seeding ? tr('Adding...', 'जोड़ रहे हैं...') : tr('Add sample items', 'सैंपल आइटम जोड़ें')}
              </button>
              <button onClick={() => setStep(3)} disabled={seeding} className={secondaryBtn}>
                {tr("I'll add my own", 'मैं खुद जोड़ूंगा')}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {tr('You are all set!', 'सब तैयार है!')}
            </h2>
            {seededItems && seededItems.length > 0 ? (
              <ul className="space-y-1 rounded-2xl border border-emerald-300/60 bg-emerald-50/80 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/25 dark:text-emerald-200">
                {seededItems.map((name) => (
                  <li key={name}>✓ {name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {tr(
                  `Add your first ${terms.material.toLowerCase()} from the ${terms.inventory} page, then create your first invoice.`,
                  'इन्वेंटरी पेज से अपना पहला आइटम जोड़ें, फिर पहला बिल बनाएं।',
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => complete(false)} disabled={finishing} className={primaryBtn}>
                {finishing ? tr('Finishing...', 'पूरा हो रहा है...') : tr('Finish setup', 'सेटअप पूरा करें')}
              </button>
              <Link href="/inventory" onClick={() => complete(false)} className={secondaryBtn}>
                {tr('Go to inventory', 'इन्वेंटरी देखें')}
              </Link>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-xl border border-rose-300/60 bg-rose-50/90 p-3 text-xs text-rose-700 dark:border-rose-400/30 dark:bg-rose-950/25 dark:text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
