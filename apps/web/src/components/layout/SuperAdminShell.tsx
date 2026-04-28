'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { NotificationBell } from './NotificationBell'

const navItems = [
  { label: 'Platform Overview', href: '/super-admin' },
  { label: 'Businesses', href: '/super-admin/businesses' },
  { label: 'Users', href: '/super-admin/users' },
  { label: 'Metrics', href: '/super-admin/metrics' },
  { label: 'Tickets', href: '/super-admin/tickets' },
  { label: 'Settings', href: '/super-admin/settings' },
]

function NavIcon({ href, className = '' }: { href: string; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none' as const, 'aria-hidden': true }
  if (href === '/super-admin') {
    return (
      <svg {...common}>
        <path d="M4 12h7V4H4v8Zm9 8h7v-5h-7v5Zm0-9h7V4h-7v7Zm-9 9h7v-5H4v5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/super-admin/businesses') {
    return (
      <svg {...common}>
        <path d="M4 20h16M6 20V8h4v12M14 20V4h4v16M8 8h0M16 8h0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/super-admin/users') {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/super-admin/metrics') {
    return (
      <svg {...common}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/super-admin/tickets') {
    return (
      <svg {...common}>
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.28 0-2.49-.28-3.58-.77L3 21l1.8-5.56A8.47 8.47 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { token, user, logout } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !token) router.replace('/auth/login')
  }, [mounted, token, router])

  useEffect(() => {
    if (mounted && token && user && user.role !== 'SUPER_ADMIN') router.replace('/dashboard')
  }, [mounted, token, user, router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const stored = window.localStorage.getItem('theme_preference')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldUseDark = stored ? stored === 'dark' : prefersDark
    root.classList.toggle('dark', shouldUseDark)
    setIsDarkMode(shouldUseDark)
  }, [])

  if (!mounted || !token || user?.role !== 'SUPER_ADMIN') return null

  function toggleTheme() {
    if (typeof window === 'undefined') return
    const next = !isDarkMode
    const root = document.documentElement
    root.classList.toggle('dark', next)
    window.localStorage.setItem('theme_preference', next ? 'dark' : 'light')
    setIsDarkMode(next)
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_26%),linear-gradient(180deg,#f3f7f6_0%,#eef4f8_48%,#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_26%),linear-gradient(180deg,#020617_0%,#0f172a_48%,#111827_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 px-3 py-4 sm:px-4 md:gap-5 md:px-6 md:py-5">
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-[300px] shrink-0 flex-col overflow-hidden rounded-[32px] border border-white/70 bg-slate-950 p-5 text-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] xl:flex">
          <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Super Admin</div>
            <div className="mt-2 text-[30px] font-semibold tracking-tight leading-tight">Platform</div>
          </div>

          <nav className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between rounded-2xl px-4 py-3 text-base transition-colors',
                    active ? 'bg-sky-500 text-slate-950' : 'text-slate-100 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <NavIcon href={item.href} className="h-4 w-4" />
                    <span className="font-medium">{item.label}</span>
                  </span>
                  <span className={cn('h-2.5 w-2.5 rounded-full', active ? 'bg-emerald-200' : 'bg-slate-500')} />
                </Link>
              )
            })}
          </nav>

          <div className="mt-4 shrink-0 pt-2">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">{user.role}</div>
              <button
                onClick={logout}
                className="mt-4 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-4 z-20 mb-5 rounded-[30px] border border-white/70 bg-white/82 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/72">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">Platform control center</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Super Admin Portal</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-300">{today}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleTheme}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
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
                <NotificationBell isSuperAdmin />
                <div className="rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  Platform live
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto xl:hidden">
              {navItems.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition-colors',
                      active
                        ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                        : 'border-slate-200 bg-white/80 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
              <button
                onClick={logout}
                className="whitespace-nowrap rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
              >
                Sign out
              </button>
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}
