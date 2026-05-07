'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { pageTitles } from './navigation'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { getDeferredInstallPrompt } from '@/lib/pwa-install'
import { NotificationBell } from './NotificationBell'
import { useI18n } from '@/lib/i18n'
import { LanguageSelect } from '@/components/common/LanguageSelect'
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities'

type InstallTarget = 'android' | 'ios' | 'desktop' | 'other'

function detectInstallTarget(): InstallTarget {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent.toLowerCase()
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('macintosh') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (ua.includes('android')) return 'android'
  if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) return 'desktop'
  return 'other'
}

function exportPageForPath(pathname: string) {
  if (pathname.startsWith('/orders')) return 'orders'
  if (pathname.startsWith('/customers')) return 'customers'
  if (pathname.startsWith('/inventory')) return 'inventory'
  if (pathname.startsWith('/delivery')) return 'delivery'
  if (pathname.startsWith('/khata')) return 'khata'
  if (pathname.startsWith('/reports')) return 'reports'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'dashboard'
}

export function Topbar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, logout } = useAuthStore()
  const { hasModule } = useTenantCapabilities()
  const { t, language } = useI18n()
  const titleKey = pageTitles[pathname] ?? 'brand.cementHouse'
  const page = exportPageForPath(pathname)
  const [isExporting, setIsExporting] = useState(false)
  const [installTarget, setInstallTarget] = useState<InstallTarget>('other')
  const [isInstalled, setIsInstalled] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false)
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN'
  const today = new Date().toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const trialDaysRemaining = user?.subscriptionEndsAt ? Math.max(0, Math.ceil((new Date(user.subscriptionEndsAt).getTime() - Date.now()) / 86_400_000)) : 0
  const showTrialBanner = user?.role === 'OWNER' && user?.subscriptionStatus === 'TRIAL' && !user?.subscriptionInterval
  const showTopTrialBanner = showTrialBanner && !pathname.startsWith('/settings') && !trialBannerDismissed
  const showTrialPill = showTrialBanner && !pathname.startsWith('/settings') && trialBannerDismissed
  const trialMessage =
    trialDaysRemaining > 0
      ? `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} remaining in your free trial. Get a subscription to actively access the platform without interruption.`
      : 'Your free trial has ended. Subscribe now to keep accessing the full platform.'
  const canCreateOrders = hasModule('orders')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as any).standalone)
    const target = detectInstallTarget()
    setIsInstalled(standalone)
    setInstallTarget(standalone ? 'other' : target)
    const onInstalled = () => {
      setIsInstalled(true)
      setInstallTarget('other')
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const stored = window.localStorage.getItem('theme_preference')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldUseDark = stored ? stored === 'dark' : prefersDark
    root.classList.toggle('dark', shouldUseDark)
    setIsDarkMode(shouldUseDark)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!showTrialBanner) {
      setTrialBannerDismissed(false)
      return
    }
    const hideUntilRaw = window.localStorage.getItem('trial_banner_hide_until')
    const hideUntil = hideUntilRaw ? Number(hideUntilRaw) : 0
    setTrialBannerDismissed(Number.isFinite(hideUntil) && hideUntil > Date.now())
  }, [showTrialBanner, user?.subscriptionEndsAt])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  function toggleTheme() {
    if (typeof window === 'undefined') return
    const next = !isDarkMode
    const root = document.documentElement
    root.classList.toggle('dark', next)
    window.localStorage.setItem('theme_preference', next ? 'dark' : 'light')
    setIsDarkMode(next)
  }

  function hideTrialBanner(hours: number) {
    if (typeof window === 'undefined') return
    if (hours <= 0) {
      window.localStorage.removeItem('trial_banner_hide_until')
      setTrialBannerDismissed(false)
      return
    }
    const until = Date.now() + hours * 60 * 60 * 1000
    window.localStorage.setItem('trial_banner_hide_until', String(until))
    setTrialBannerDismissed(true)
  }

  async function handleExport() {
    try {
      setIsExporting(true)
      const token = window.localStorage.getItem('auth_token')
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const params = new URLSearchParams()
      params.set('page', page)
      params.set('format', 'csv')
      if (page === 'dashboard') {
        const range = searchParams.get('range')
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        if (range) params.set('range', range)
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)
      }
      if (page === 'reports') {
        const granularity = searchParams.get('granularity')
        const year = searchParams.get('year')
        const month = searchParams.get('month')
        if (granularity) params.set('granularity', granularity)
        if (year) params.set('year', year)
        if (month) params.set('month', month)
      }

      const response = await fetch(`${baseUrl}/api/reports/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') ?? undefined
      const filenameMatch = disposition?.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `${page}-snapshot`
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      window.alert(language === 'hi' ? 'à¤à¤•à¥à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ à¤µà¤¿à¤«à¤² à¤¹à¥à¤†à¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤«à¤¿à¤° à¤¸à¥‡ à¤ªà¥à¤°à¤¯à¤¾à¤¸ à¤•à¤°à¥‡à¤‚à¥¤' : language === 'hinglish' ? 'Export fail hua. Please dobara try karo.' : 'Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleDesktopInstall() {
    const prompt = getDeferredInstallPrompt()
    if (!prompt) {
      if (installTarget === 'ios') {
        window.alert('On iPhone/iPad: tap Share, then choose Add to Home Screen.')
      } else {
        window.alert('Use your browser menu and choose Install app.')
      }
      return
    }

    await prompt.prompt()
    await prompt.userChoice
  }

  const installTooltip =
    installTarget === 'desktop'
      ? 'Install NexaHub as a desktop app for faster access.'
      : installTarget === 'ios'
      ? 'Tap Share and choose Add to Home Screen.'
      : 'Install NexaHub for faster access.'
  return (
    <header className="sticky top-0 z-20 shrink-0 px-4 pb-4 pt-4 md:px-6">
      {showTopTrialBanner ? (
        <>
        <div className="mb-2 flex items-center justify-between gap-2 rounded-full border border-amber-200/80 bg-amber-50/95 px-3 py-1.5 text-[11px] text-amber-900 shadow-sm sm:hidden dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="truncate">
            {language === 'hi'
              ? `à¤Ÿà¥à¤°à¤¾à¤¯à¤²: ${trialDaysRemaining} à¤¦à¤¿à¤¨ à¤¶à¥‡à¤·`
              : language === 'hinglish'
              ? `Trial: ${trialDaysRemaining} din left`
              : `Trial: ${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => hideTrialBanner(12)}
              className="rounded-full border border-amber-300/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              {language === 'hi' ? 'à¤¬à¤¾à¤¦ à¤®à¥‡à¤‚' : language === 'hinglish' ? 'Later' : 'Later'}
            </button>
            <button
              type="button"
              onClick={() => hideTrialBanner(24)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              aria-label={language === 'hi' ? 'à¤¸à¥‚à¤šà¤¨à¤¾ à¤¬à¤‚à¤¦ à¤•à¤°à¥‡à¤‚' : language === 'hinglish' ? 'Reminder band karo' : 'Dismiss reminder'}
            >
              Ã—
            </button>
          </div>
        </div>
        <div className="mb-3 hidden rounded-[24px] border border-amber-200/80 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-sm sm:block dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start justify-between gap-3">
            <span>{trialMessage}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => hideTrialBanner(12)}
                className="rounded-full border border-amber-300/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/40 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                {language === 'hi' ? 'à¤¬à¤¾à¤¦ à¤®à¥‡à¤‚' : language === 'hinglish' ? 'Later' : 'Later'}
              </button>
              <button
                type="button"
                onClick={() => hideTrialBanner(24)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
                aria-label={language === 'hi' ? 'à¤¸à¥‚à¤šà¤¨à¤¾ à¤¬à¤‚à¤¦ à¤•à¤°à¥‡à¤‚' : language === 'hinglish' ? 'Reminder band karo' : 'Dismiss reminder'}
              >
                Ã—
              </button>
            </div>
          </div>
        </div>
        </>
      ) : null}
      <div className="flex flex-col gap-3 rounded-[28px] border border-white/60 bg-white/75 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-white/10 dark:bg-slate-950/60">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
            {t('top.analyticsWorkspace')}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{t(titleKey)}</span>
            <span className="text-sm text-slate-500 dark:text-slate-300">{today}</span>
            <img
              src="/icons/nexahub-logo.jpeg"
              alt="NexaHub"
              className="ml-auto h-10 w-10 rounded-lg object-cover shadow-sm sm:hidden"
              loading="eager"
            />
            {showTrialPill ? (
              <button
                type="button"
                onClick={() => hideTrialBanner(0)}
                className="inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
                title={trialMessage}
              >
                {language === 'hi'
                  ? `à¤Ÿà¥à¤°à¤¾à¤¯à¤²: ${trialDaysRemaining} à¤¦à¤¿à¤¨`
                  : language === 'hinglish'
                  ? `Trial: ${trialDaysRemaining} din`
                  : `Trial: ${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} left`}
              </button>
            ) : null}
          </div>
        </div>
        <div className="hidden w-full flex-wrap items-center gap-1.5 sm:flex sm:w-auto sm:gap-2 sm:justify-end">
          <LanguageSelect compact />
          <button
            onClick={toggleTheme}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:h-9 sm:w-9"
            title={isDarkMode ? t('theme.light') : t('theme.dark')}
            aria-label={isDarkMode ? t('theme.light') : t('theme.dark')}
          >
            {isDarkMode ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0 0 0 0 0a7 7 0 0 0 9.79 9.79z" />
              </svg>
            )}
          </button>
          {isInstalled ? (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200">
              Installed
            </span>
          ) : null}
          {installTarget !== 'other' && !isInstalled ? (
            <div className="group relative">
              <button
                onClick={handleDesktopInstall}
                className="inline-flex rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white sm:px-4 sm:py-2 sm:text-xs"
              >
                {installTarget === 'ios' ? 'Add to Home' : t('top.installApp')}
              </button>
              <div className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/60 bg-white/95 px-3 py-2 text-[11px] font-medium text-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.14)] backdrop-blur group-hover:block group-focus-within:block dark:border-white/10 dark:bg-slate-950/95 dark:text-slate-200">
                {installTooltip}
              </div>
            </div>
          ) : null}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 md:inline-flex md:px-4 md:py-2 md:text-xs"
          >
            {isExporting ? t('top.exporting') : t('top.exportCsv')}
          </button>
          <NotificationBell />
          {canCreateOrders ? (
            <>
              <Link
                href="/orders/new"
                className="hidden rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 xl:inline-flex xl:px-4 xl:py-2 xl:text-xs"
              >
                {t('top.newOrder')}
              </Link>
              <Link
                href="/orders?openNewOrder=1"
                className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 xl:hidden sm:px-4 sm:py-2 sm:text-xs"
              >
                {t('top.newOrder')}
              </Link>
            </>
          ) : null}
          <button onClick={logout} className="rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-200 dark:hover:bg-rose-500/10">{t('common.signOut')}</button>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:hidden">
          <NotificationBell />
          {canCreateOrders ? (
            <Link
              href="/orders?openNewOrder=1"
              className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              {t('top.newOrder')}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => { if (typeof window !== 'undefined') { window.dispatchEvent(new CustomEvent('app:close-mobile-more')) } setMobileMenuOpen(true) }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={language === 'hi' ? 'à¤®à¥‡à¤¨à¥à¤¯à¥‚ à¤–à¥‹à¤²à¥‡à¤‚' : language === 'hinglish' ? 'Menu kholo' : 'Open menu'}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-[60] sm:hidden">
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" aria-label="Close menu" />
          <aside className="absolute right-0 top-0 h-full w-[88%] max-w-[360px] overflow-y-auto border-l border-slate-200 bg-white px-4 pb-6 pt-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {language === 'hi' ? 'क्विक पैनल' : language === 'hinglish' ? 'Quick panel' : 'Quick panel'}
              </div>
              <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                {language === 'hi' ? 'वर्कस्पेस शॉर्टकट्स' : language === 'hinglish' ? 'Workspace shortcuts' : 'Workspace shortcuts'}
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{language === 'hi' ? 'त्वरित क्रियाएं' : language === 'hinglish' ? 'Quick actions' : 'Quick actions'}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {language === 'hi' ? 'मुख्य सेटिंग्स और टूल्स' : language === 'hinglish' ? 'Main settings and tools' : 'Main settings and tools'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {language === 'hi' ? 'बंद करें' : language === 'hinglish' ? 'Band karo' : 'Close'}
              </button>
            </div>
            <div className="space-y-2.5">
              <div className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {language === 'hi' ? 'प्राथमिकताएं' : language === 'hinglish' ? 'Preferences' : 'Preferences'}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-violet-200 bg-violet-100/80 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h8M7 5c0 6-3 9-3 9M13 5h7M16.5 5c0 6 3.5 9 3.5 9M7 14c1.5 0 3.5-.8 5-2M14 19l2-6 2 6M14.7 17h2.6" /></svg>
                    </span>
                    <span>{language === 'hi' ? 'भाषा चुनें' : language === 'hinglish' ? 'Choose language' : 'Choose language'}</span>
                  </div>
                  <LanguageSelect compact />
                </div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[16px] font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-violet-200 bg-violet-100/80 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" /></svg>
                  </span>
                  <span>{isDarkMode ? t('theme.light') : t('theme.dark')}</span>
                </span>
                <span aria-hidden="true" className="text-slate-400">›</span>
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {language === 'hi' ? 'ऐप' : language === 'hinglish' ? 'App' : 'App'}
              </div>
              {installTarget !== 'other' && !isInstalled ? (
                <button
                  type="button"
                  onClick={handleDesktopInstall}
                  className="flex w-full items-center justify-between rounded-xl bg-slate-950 px-3 py-2.5 text-left text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-violet-300/50 bg-violet-200/25 text-violet-100 dark:border-violet-500/40 dark:bg-violet-500/20 dark:text-violet-700">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 21h14" /></svg>
                    </span>
                    <span>{installTarget === 'ios' ? 'Add to Home' : t('top.installApp')}</span>
                  </span>
                  <span aria-hidden="true" className="text-white/80 dark:text-slate-900/80">›</span>
                </button>
              ) : null}
              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[16px] font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-violet-200 bg-violet-100/80 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 1 1-1.4 1.4l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1 1 0 1 1-2 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 1 1-1.4-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H9a1 1 0 1 1 0-2h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 1 1 1.4-1.4l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V5a1 1 0 1 1 2 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 1 1 1.4 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H19a1 1 0 1 1 0 2h-.2a1 1 0 0 0-.9.6z" /></svg>
                  </span>
                  <span>{language === 'hi' ? 'सेटिंग्स' : language === 'hinglish' ? 'Settings' : 'Settings'}</span>
                </span>
                <span aria-hidden="true" className="text-slate-400">›</span>
              </Link>
              <Link
                href="/tickets"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[16px] font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-violet-200 bg-violet-100/80 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  </span>
                  <span>{language === 'hi' ? 'सहायता और सपोर्ट' : language === 'hinglish' ? 'Help & support' : 'Help & support'}</span>
                </span>
                <span aria-hidden="true" className="text-slate-400">›</span>
              </Link>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-500/90 dark:text-rose-300/90">
                {language === 'hi' ? 'अकाउंट' : language === 'hinglish' ? 'Account' : 'Account'}
              </div>
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-xl border border-rose-200 px-3 py-2.5 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-200 dark:hover:bg-rose-500/10"
              >
                <span className="inline-flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-400/40 dark:bg-rose-500/10 dark:text-rose-300">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
                  </span>
                  <span>{t('common.signOut')}</span>
                </span>
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </header>
  )
}

