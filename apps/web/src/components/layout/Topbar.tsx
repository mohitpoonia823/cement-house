'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/orders':    'Orders',
  '/orders/new':'New order',
  '/khata':     'Khata',
  '/customers': 'Customers',
  '/inventory': 'Inventory',
  '/delivery':  'Delivery',
  '/reports':   'Reports',
  '/settings':  'Settings',
}

export function Topbar() {
  const pathname = usePathname()
  const title    = titles[pathname] ?? 'Cement House'
  const today    = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <header className="h-12 flex items-center justify-between px-5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0">
      <div>
        <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{title}</span>
        <span className="text-xs text-stone-400 ml-3">{today}</span>
      </div>
      <Link href="/orders/new"
        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium">
        + New order
      </Link>
    </header>
  )
}
