'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navItems } from './navigation'
import { useAuthStore } from '@/store/auth'
import { useI18n } from '@/lib/i18n'
import { useTenantCapabilities } from '@/hooks/useTenantCapabilities'

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
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const { t } = useI18n()
  const { hasModule, hasFeature } = useTenantCapabilities()
  const isOwner = user?.role === 'OWNER'

  const visible = navItems
    .filter((item) => item.group !== 'workspace' && item.group !== 'insights')
    .filter((item) => ['dashboard', 'orders', 'customers', 'inventory', 'khata'].some((k) => item.href.includes(k)))
    .filter((item) => {
      if (item.moduleKey && !hasModule(item.moduleKey)) return false
      if (item.featureKey && !hasFeature(item.featureKey)) return false
      if (isOwner) return true
      if (item.permissionId) return user?.permissions?.includes(item.permissionId)
      return true
    })
    .slice(0, 5)

  if (!visible.length) return null

  return (
    <nav className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-slate-200/80 bg-white/95 px-2 py-2 shadow-[0_14px_40px_rgba(15,23,42,0.16)] backdrop-blur xl:hidden dark:border-slate-700 dark:bg-slate-950/95">
      <ul className="grid grid-cols-5 gap-1">
        {visible.map((item) => {
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
                <span aria-hidden="true">{iconFor(item.href)}</span>
                <span className="mt-0.5 truncate">{t(item.label)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
