'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { groupLabels, navItems } from './navigation'
import { useI18n } from '@/lib/i18n'

function MenuIcon({ href, className = '' }: { href: string; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none' as const, 'aria-hidden': true }
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
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  if (href === '/imported-bills') {
    return (
      <svg {...common}>
        <path d="M5 4h11l3 3v13H5zM8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/delivery') {
    return (
      <svg {...common}>
        <path d="M3 7h11v8H3zM14 10h3l4 3v2h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/khata') {
    return (
      <svg {...common}>
        <path d="M4 5h16v14H4zM8 9h8M8 13h5M16 13h0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/reports') {
    return (
      <svg {...common}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (href === '/tickets') {
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

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { t } = useI18n()
  const isOwner = user?.role === 'OWNER'

  const visible = navItems.filter((item) => {
    if (item.group === 'workspace' && item.href !== '/tickets') return isOwner
    if (item.group === 'insights') return isOwner
    if (isOwner) return true
    if (item.permissionId) return user?.permissions?.includes(item.permissionId)
    return true
  })

  const grouped = visible.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {} as Record<string, typeof navItems>)

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden h-screen w-[292px] min-w-[292px] border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,247,250,0.98))] px-4 py-4 text-slate-900 shadow-[18px_0_70px_rgba(15,23,42,0.10)] backdrop-blur xl:block dark:!border-slate-800 dark:!bg-none dark:!bg-slate-950 dark:!text-slate-100 dark:shadow-[18px_0_70px_rgba(2,6,23,0.35)]">
      <div className="flex h-full flex-col rounded-[22px]">
      <div className="rounded-[20px] border border-emerald-200/60 bg-gradient-to-br from-emerald-100 via-cyan-50 to-white p-3.5 shadow-[0_12px_24px_rgba(16,185,129,0.06)] dark:!border-emerald-500/30 dark:!bg-slate-900 dark:from-emerald-400/0 dark:via-sky-400/0 dark:to-transparent dark:shadow-none">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">{t('brand.cementHouse')}</div>
        <div className="mt-2 text-[16px] font-semibold leading-tight tracking-tight text-slate-950 dark:text-white">{user?.businessName ?? 'Poonia Trading Company'}</div>
        <div className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">{user?.businessCity ?? 'Hisar, Haryana'}</div>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-200">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          {t('top.platformLive')}
        </div>
      </div>

      <nav className="mt-2.5 flex-1 overflow-y-auto pr-1">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {t(groupLabels[group])}
            </div>
            {items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' &&
                  pathname.startsWith(item.href + '/') &&
                  !(item.href === '/orders' && pathname === '/orders/new'))

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'mb-0.5 flex items-center justify-between rounded-2xl px-3 py-2 text-sm transition-all',
                    active
                      ? 'bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] dark:!bg-sky-500 dark:!text-slate-950'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <MenuIcon href={item.href} className="h-4 w-4" />
                    <span className="font-medium">{t(item.label)}</span>
                  </span>
                  <span className={cn('h-2.5 w-2.5 rounded-full', active ? 'bg-emerald-400 dark:bg-emerald-100' : 'bg-slate-400 dark:bg-slate-500')} />
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="mt-2.5 flex items-center gap-2.5 rounded-[20px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/14 text-xs font-semibold text-sky-700 dark:bg-sky-500/18 dark:text-sky-100">
          {user?.name?.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{user?.name}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{user?.role}</div>
        </div>
        <button
          onClick={logout}
          className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-rose-400/60 hover:text-rose-600 dark:border-white/10 dark:text-slate-300 dark:hover:text-rose-200"
        >
          {t('common.signOut')}
        </button>
      </div>
      </div>
    </aside>
  )
}
