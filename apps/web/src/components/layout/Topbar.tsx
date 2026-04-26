'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { navItems, pageTitles } from './navigation'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { getDeferredInstallPrompt } from '@/lib/pwa-install'

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

function exportLabel(page: string) {
  if (page === 'dashboard' || page === 'reports') return 'Export PDF'
  return 'Export CSV'
}

export function Topbar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const isOwner = user?.role === 'OWNER'
  const title = pageTitles[pathname] ?? 'Cement House'
  const page = exportPageForPath(pathname)
  const [isExporting, setIsExporting] = useState(false)
  const [installTarget, setInstallTarget] = useState<InstallTarget>('other')
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const trialDaysRemaining = user?.subscriptionEndsAt ? Math.max(0, Math.ceil((new Date(user.subscriptionEndsAt).getTime() - Date.now()) / 86_400_000)) : 0
  const showTrialBanner = user?.role === 'OWNER' && user?.subscriptionStatus === 'TRIAL' && !user?.subscriptionInterval
  const trialMessage =
    trialDaysRemaining > 0
      ? `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} remaining in your free trial. Get a subscription to actively access the platform without interruption.`
      : 'Your free trial has ended. Subscribe now to keep accessing the full platform.'
  const mobileNavItems = navItems.filter((item) => {
    if (item.group === 'workspace' || item.group === 'insights') return isOwner
    if (isOwner) return true
    if (item.permissionId) return user?.permissions?.includes(item.permissionId)
    return true
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const target = detectInstallTarget()
    setInstallTarget(standalone ? 'other' : target)
  }, [])

  async function handleExport() {
    try {
      setIsExporting(true)
      const token = window.localStorage.getItem('auth_token')
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const params = new URLSearchParams()
      params.set('page', page)
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
      window.alert('Export failed. Please try again.')
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
      ? 'Install Cement House as a desktop app for faster access.'
      : installTarget === 'ios'
      ? 'Tap Share and choose Add to Home Screen.'
      : 'Install Cement House for faster access.'

  return (
    <header className="sticky top-0 z-20 shrink-0 px-4 pb-4 pt-4 md:px-6">
      {showTrialBanner ? (
        <div className="mb-3 rounded-[24px] border border-amber-200/80 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
          {trialMessage}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 rounded-[28px] border border-white/60 bg-white/75 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-white/10 dark:bg-slate-950/60">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
            Analytics workspace
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</span>
            <span className="text-sm text-slate-500 dark:text-slate-300">{today}</span>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {installTarget !== 'other' ? (
            <div className="group relative">
              <button
                onClick={handleDesktopInstall}
                className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
              >
                {installTarget === 'ios' ? 'Add to Home' : 'Install App'}
              </button>
              <div className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/60 bg-white/95 px-3 py-2 text-[11px] font-medium text-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.14)] backdrop-blur group-hover:block group-focus-within:block dark:border-white/10 dark:bg-slate-950/95 dark:text-slate-200">
                {installTooltip}
              </div>
            </div>
          ) : null}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="hidden rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 md:inline-flex"
          >
            {isExporting ? 'Exporting...' : exportLabel(page)}
          </button>
          <Link
            href="/orders/new"
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            + New order
          </Link>
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto xl:hidden">
        {mobileNavItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' &&
              pathname.startsWith(item.href + '/') &&
              !(item.href === '/orders' && pathname === '/orders/new'))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'rounded-full border border-slate-950 bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:border-sky-400 dark:bg-sky-400 dark:text-slate-950'
                  : 'rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
              }
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </header>
  )
}
