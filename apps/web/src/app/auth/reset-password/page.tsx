'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

function ResetPasswordContent() {
  const { t: i18nT, language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) =>
    language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!token) {
      setError(t('Reset token is missing or invalid.', 'रीसेट टोकन नहीं मिला या अमान्य है।', 'Reset token missing ya invalid hai.'))
      return
    }
    if (newPassword.length < 6) {
      setError(t('Password must be at least 6 characters.', 'पासवर्ड कम से कम 6 अक्षर का होना चाहिए।', 'Password kam se kam 6 characters ka hona chahiye.'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('Passwords do not match.', 'पासवर्ड मेल नहीं खा रहे।', 'Passwords match nahi kar rahe.'))
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/api/auth/reset-password', { token, newPassword })
      setMessage(response.data?.data?.message ?? t('Password reset successful. Redirecting to login...', 'पासवर्ड सफलतापूर्वक रीसेट हुआ। लॉगिन पर भेजा जा रहा है...', 'Password reset successful. Login par redirect ho raha hai...'))
      setTimeout(() => router.replace('/auth/login'), 1200)
    } catch (err: any) {
      setError(err.response?.data?.error ?? t('Unable to reset password. Please request a new link.', 'पासवर्ड रीसेट नहीं हो सका। कृपया नया लिंक प्राप्त करें।', 'Password reset nahi ho paya. Naya link request karo.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)] px-4 py-10 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_56%,#111827_100%)]">
      <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white/86 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
        <div className="mb-4 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{t('Reset password', 'पासवर्ड रीसेट करें', 'Password reset karo')}</div>
        <div className="mb-6 text-sm text-slate-600 dark:text-slate-300">
          {t('Set a new password for your account.', 'अपने अकाउंट के लिए नया पासवर्ड सेट करें।', 'Apne account ke liye naya password set karo.')}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('New password', 'नया पासवर्ड', 'New password')}</label>
              <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400">
                {showPassword ? t('Hide', 'छुपाएं', 'Hide') : t('Show', 'दिखाएं', 'Show')}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('Min 6 characters', 'कम से कम 6 अक्षर', 'Min 6 characters')}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('Confirm password', 'पासवर्ड की पुष्टि करें', 'Confirm password')}</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('Re-enter new password', 'नया पासवर्ड दोबारा दर्ज करें', 'Naya password dobara daalo')}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              required
            />
          </div>

          {message && <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</div>}
          {error && <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            {loading ? t('Resetting password...', 'पासवर्ड रीसेट हो रहा है...', 'Password reset ho raha hai...') : t('Reset password', 'पासवर्ड रीसेट करें', 'Password reset karo')}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eef5f7_52%,#edf3f8_100%)]" />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
