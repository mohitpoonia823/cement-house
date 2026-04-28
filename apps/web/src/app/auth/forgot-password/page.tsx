'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

export default function ForgotPasswordPage() {
  const { t: i18nT, language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) =>
    language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const payload = mode === 'email' ? { email } : { phone }
      const response = await api.post('/api/auth/forgot-password', payload)
      if (response.data?.success === false) {
        setError(response.data?.error ?? t('Unable to send reset link. Please try again.', 'रीसेट लिंक भेजने में समस्या हुई। कृपया फिर से प्रयास करें।', 'Reset link bhejne me problem hui. Dobara try karo.'))
      } else {
        setMessage(response.data?.data?.message ?? t('If the account exists, a reset link has been sent.', 'यदि अकाउंट मौजूद है, तो रीसेट लिंक भेज दिया गया है।', 'Agar account exist karta hai to reset link bhej diya gaya hai.'))
      }
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('Unable to send reset link. Please try again.', 'रीसेट लिंक भेजने में समस्या हुई। कृपया फिर से प्रयास करें।', 'Reset link bhejne me problem hui. Dobara try karo.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/86 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
        <div className="mb-4 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{t('Forgot password', 'पासवर्ड भूल गए', 'Password bhool gaye')}</div>
        <div className="mb-6 text-sm text-slate-600 dark:text-slate-300">
          {t('Enter your account email. For legacy accounts without email, use phone to check recovery support.', 'अपना अकाउंट ईमेल दर्ज करें। जिन पुराने अकाउंट्स में ईमेल नहीं है, वे रिकवरी सपोर्ट के लिए फोन विकल्प चुनें।', 'Apna account email daalo. Purane accounts jisme email nahi hai, recovery support ke liye phone option use karo.')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('email')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                mode === 'email'
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {t('Email', 'ईमेल', 'Email')}
            </button>
            <button
              type="button"
              onClick={() => setMode('phone')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                mode === 'phone'
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {t('Phone', 'फोन', 'Phone')}
            </button>
          </div>

          <div>
            {mode === 'email' ? (
              <>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('Email', 'ईमेल', 'Email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@business.com"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  required
                />
              </>
            ) : (
              <>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('Phone number', 'फोन नंबर', 'Phone number')}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  maxLength={10}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  required
                />
              </>
            )}
          </div>

          {message && <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</div>}
          {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            {loading
              ? t('Sending link...', 'लिंक भेजा जा रहा है...', 'Link bheja ja raha hai...')
              : mode === 'email'
                ? t('Send reset link', 'रीसेट लिंक भेजें', 'Reset link bhejo')
                : t('Check recovery options', 'रिकवरी विकल्प देखें', 'Recovery options dekho')}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
          {t('Back to', 'वापस', 'Back to')}{' '}
          <Link href="/auth/login" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
            {i18nT('auth.signIn')}
          </Link>
        </div>
      </div>
    </div>
  )
}
