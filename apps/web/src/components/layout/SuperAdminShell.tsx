'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Platform Overview', href: '/super-admin' },
  { label: 'Businesses', href: '/super-admin/businesses' },
  { label: 'Users', href: '/super-admin/users' },
  { label: 'Metrics', href: '/super-admin/metrics' },
  { label: 'Settings', href: '/super-admin/settings' },
]

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { token, user, logout } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !token) router.replace('/auth/login')
  }, [mounted, token, router])

  useEffect(() => {
    if (mounted && token && user && user.role !== 'SUPER_ADMIN') router.replace('/dashboard')
  }, [mounted, token, user, router])

  if (!mounted || !token || user?.role !== 'SUPER_ADMIN') return null

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_26%),linear-gradient(180deg,#f3f7f6_0%,#eef4f8_48%,#eef2f7_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.14),transparent_24%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_26%),linear-gradient(180deg,#020617_0%,#0f172a_48%,#111827_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 px-3 py-4 sm:px-4 md:gap-5 md:px-6 md:py-5">
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-[300px] shrink-0 rounded-[32px] border border-white/70 bg-slate-950 p-5 text-white shadow-[0_28px_80px_rgba(15,23,42,0.28)] xl:block">
          <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-200/80">Super Admin</div>
            <div className="mt-3 text-3xl font-semibold tracking-tight">Platform command</div>
            <div className="mt-2 text-sm text-slate-300">Cross-business control, subscriptions, support access, and platform health.</div>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors',
                    active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/8 hover:text-white'
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className={cn('h-2.5 w-2.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-600')} />
                </Link>
              )
            })}
          </nav>

          <div className="mt-auto pt-6">
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
              <div className="rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                Platform live
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
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}
