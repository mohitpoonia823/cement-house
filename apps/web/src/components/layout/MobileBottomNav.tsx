'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navItems } from './navigation'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities'
import { useEffect, useMemo, useState } from 'react'

function iconFor(href: string) {
  const common = { className: 'h-5 w-5', viewBox: '0 0 24 24', fill: 'none' as const, 'aria-hidden': true }
  if (href === '/dashboard') {
    return (
      <svg {...common}>
        <path d="M4 12h7V4H4v8Zm9 8h7v-5h-7v5Zm0-9h7V4h-7v7Zm-9 9h7v-5H4v5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/orders') {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/customers') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/inventory') {
    return (
      <svg {...common}>
        <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5ZM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/khata') {
    return (
      <svg {...common}>
        <path d="M4 5h16v14H4zM8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/reports') {
    return (
      <svg {...common}>
        <path d="M5 19V9M12 19V5M19 19v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/imported-bills') {
    return (
      <svg {...common}>
        <path d="M7 4h8l4 4v12H7zM15 4v4h4M10 12h6M10 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/tickets') {
    return (
      <svg {...common}>
        <path d="M4 10a2 2 0 0 1 2-2h12v3a2 2 0 1 0 0 4v3H6a2 2 0 0 1-2-2zM9 8v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/settings') {
    return (
      <svg {...common}>
        <path d="M10.3 4.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 0 1 .24l.8-.2a1 1 0 0 1 1.2.7l.2.8a1 1 0 0 0 .7.7l.8.2a1 1 0 0 1 .7 1.2l-.2.8a1 1 0 0 0 .24 1l.6.6a1 1 0 0 1 0 1.4l-.6.6a1 1 0 0 0-.24 1l.2.8a1 1 0 0 1-.7 1.2l-.8.2a1 1 0 0 0-.7.7l-.2.8a1 1 0 0 1-1.2.7l-.8-.2a1 1 0 0 0-1 .24l-.6.6a1 1 0 0 1-1.4 0l-.6-.6a1 1 0 0 0-1-.24l-.8.2a1 1 0 0 1-1.2-.7l-.2-.8a1 1 0 0 0-.7-.7l-.8-.2a1 1 0 0 1-.7-1.2l.2-.8a1 1 0 0 0-.24-1l-.6-.6a1 1 0 0 1 0-1.4l.6-.6a1 1 0 0 0 .24-1l-.2-.8a1 1 0 0 1 .7-1.2l.8-.2a1 1 0 0 0 .7-.7l.2-.8a1 1 0 0 1 1.2-.7l.8.2a1 1 0 0 0 1-.24zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/more') {
    return (
      <svg {...common}>
        <circle cx="6" cy="12" r="1.8" fill="currentColor" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        <circle cx="18" cy="12" r="1.8" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const { t, language } = useI18n()
  const { hasModule, hasFeature } = useTenantCapabilities()
  const isOwner = user?.role === 'OWNER'
  const [moreOpen, setMoreOpen] = useState(false)

  const allowedItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.group === 'workspace' && item.href !== '/tickets') return isOwner
        if (item.group === 'insights') return isOwner
        if (item.moduleKey && !hasModule(item.moduleKey)) return false
        if (item.featureKey && !hasFeature(item.featureKey)) return false
        if (isOwner) return true
        if (item.permissionId) return user?.permissions?.includes(item.permissionId)
        return true
      }),
    [hasFeature, hasModule, isOwner, user?.permissions],
  )

  const core = allowedItems.filter((item) => ['/dashboard', '/orders', '/customers', '/inventory'].includes(item.href))
  const moreItems = allowedItems.filter((item) => !['/dashboard', '/orders', '/customers', '/inventory'].includes(item.href))
  const moreLabel = language === 'hi' ? 'और' : language === 'hinglish' ? 'More' : 'More'

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onCloseMore = () => setMoreOpen(false)
    window.addEventListener('app:close-mobile-more', onCloseMore)
    return () => window.removeEventListener('app:close-mobile-more', onCloseMore)
  }, [])

  if (!core.length) return null

  function iconTone(href: string) {
    if (href === '/dashboard') return 'text-sky-600 dark:text-sky-300'
    if (href === '/orders') return 'text-indigo-600 dark:text-indigo-300'
    if (href === '/customers') return 'text-emerald-600 dark:text-emerald-300'
    if (href === '/inventory') return 'text-violet-600 dark:text-violet-300'
    return 'text-slate-500 dark:text-slate-300'
  }

  return (
    <>
      <nav className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-slate-200/80 bg-white/95 px-2 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.16)] backdrop-blur xl:hidden dark:border-slate-700 dark:bg-slate-950/95">
        <ul className="grid grid-cols-5 gap-1">
          {core.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href + '/') && !(item.href === '/orders' && pathname === '/orders/new'))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-1 text-[10px] font-semibold ${
                    active
                      ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
              >
                <span aria-hidden="true" className={active ? '' : iconTone(item.href)}>{iconFor(item.href)}</span>
                <span className="mt-0.5 truncate">{t(item.label)}</span>
              </Link>
            </li>
            )
          })}
          <li>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('app:close-topbar-quick-actions'))
              }
              setMoreOpen(true)
            }}
            className={`flex min-h-14 w-full flex-col items-center justify-center rounded-xl px-1 text-[10px] font-semibold ${
                moreItems.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
                  ? 'bg-slate-950 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
          >
            <span aria-hidden="true" className={moreItems.some((item) => pathname === item.href || pathname.startsWith(item.href + '/')) ? '' : 'text-violet-600 dark:text-violet-300'}>{iconFor('/more')}</span>
            <span className="mt-0.5 truncate">{moreLabel}</span>
          </button>
        </li>
        </ul>
      </nav>
      {moreOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
            aria-label="Close more menu"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[72vh] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white px-4 pb-6 pt-3 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-2 flex justify-center">
              <span className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{moreLabel}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Navigate to other workspace sections</div>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {language === 'hi' ? 'बंद करें' : language === 'hinglish' ? 'Band karo' : 'Close'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {moreItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium ${
                      active
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900'
                    }`}
                >
                  <span className="inline-flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${
                        active
                          ? 'border-white/30 bg-white/20 text-white dark:border-slate-950/20 dark:bg-slate-950/10 dark:text-slate-950'
                          : 'border-violet-200 bg-violet-100/80 text-violet-600 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300'
                      }`}
                    >
                      {iconFor(item.href)}
                    </span>
                    <span>{t(item.label)}</span>
                  </span>
                    <span aria-hidden="true" className={active ? 'text-white/90 dark:text-slate-950/80' : 'text-slate-400 dark:text-slate-500'}>›</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
