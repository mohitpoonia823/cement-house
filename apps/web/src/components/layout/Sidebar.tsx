'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'
import { groupLabels, navItems } from './navigation'

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const isOwner = user?.role === 'OWNER'

  const visible = navItems.filter((item) => {
    if (item.group === 'workspace' || item.group === 'insights') return isOwner
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
    <aside className="sticky top-0 hidden h-screen w-[280px] min-w-[280px] self-start border-r border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(240,247,250,0.98))] px-5 py-5 text-slate-900 shadow-[18px_0_70px_rgba(15,23,42,0.10)] backdrop-blur xl:block dark:border-white/10 dark:bg-slate-950/96 dark:text-white dark:shadow-[18px_0_70px_rgba(2,6,23,0.25)]">
      <div className="flex h-full flex-col overflow-hidden rounded-[30px]">
      <div className="rounded-[28px] border border-emerald-200/60 bg-gradient-to-br from-emerald-100 via-cyan-50 to-white p-5 shadow-[0_18px_40px_rgba(16,185,129,0.08)] dark:border-white/10 dark:bg-gradient-to-br dark:from-emerald-400/20 dark:via-sky-400/12 dark:to-transparent dark:shadow-none">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">Cement House</div>
        <div className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-950 dark:text-white">{user?.businessName ?? 'Poonia Trading Company'}</div>
        <div className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">{user?.businessCity ?? 'Hisar, Haryana'}</div>
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-400/14 dark:text-emerald-200">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          Operations live
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-6 pr-1">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="mb-6">
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {groupLabels[group]}
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
                    'mb-1 flex items-center justify-between rounded-2xl px-3 py-3 text-sm transition-all',
                    active
                      ? 'bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] dark:bg-white dark:text-slate-950'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white'
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className={cn('h-2.5 w-2.5 rounded-full', active ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-slate-400 dark:bg-slate-700')} />
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-3 rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/14 text-xs font-semibold text-sky-700 dark:bg-sky-500/18 dark:text-sky-100">
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
          Sign out
        </button>
      </div>
      </div>
    </aside>
  )
}
