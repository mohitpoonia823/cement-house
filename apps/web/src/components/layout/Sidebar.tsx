'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard',  href: '/dashboard',  group: 'main' },
  { label: 'New order',  href: '/orders/new', group: 'main', permissionId: 'orders' },
  { label: 'Orders',     href: '/orders',     group: 'main', permissionId: 'orders' },
  { label: 'Khata',      href: '/khata',      group: 'finance', permissionId: 'ledger' },
  { label: 'Customers',  href: '/customers',  group: 'ops', permissionId: 'customers' },
  { label: 'Inventory',  href: '/inventory',  group: 'ops', permissionId: 'inventory' },
  { label: 'Delivery',   href: '/delivery',   group: 'ops', permissionId: 'delivery' },
  { label: 'Reports',    href: '/reports',    group: 'owner' },
  { label: 'Settings',   href: '/settings',   group: 'account' },
]

const groups: Record<string, string> = {
  main: 'Main', finance: 'Finance', ops: 'Operations', owner: 'Owner', account: 'Account'
}

export function Sidebar() {
  const pathname  = usePathname()
  const { user, logout } = useAuthStore()
  const isOwner   = user?.role === 'OWNER'

  const visible = navItems.filter(i => {
    if (i.group === 'owner') return isOwner
    if (i.group === 'account') return true
    if (isOwner) return true
    if (i.permissionId) return user?.permissions?.includes(i.permissionId)
    return true // dashboard
  })
  const grouped = visible.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {} as Record<string, typeof navItems>)

  return (
    <aside style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }}
      className="h-screen flex flex-col bg-stone-50 border-r border-stone-200 dark:bg-stone-900 dark:border-stone-800">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-stone-200 dark:border-stone-800">
        <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{user?.businessName ?? 'Cement House'}</div>
        <div className="text-xs text-stone-500 mt-0.5">{user?.businessCity ?? ''}</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-stone-400">
              {groups[group]}
            </div>
            {items.map(item => {
              const active = pathname === item.href || 
                (item.href !== '/dashboard' && pathname.startsWith(item.href + '/') && !(item.href === '/orders' && pathname === '/orders/new'))
              return (
                <Link key={item.href} href={item.href}
                  className={cn(
                    'flex items-center px-4 py-2 text-sm transition-colors',
                    active
                      ? 'bg-white text-blue-600 font-medium border-l-2 border-blue-500 dark:bg-stone-800 dark:text-blue-400'
                      : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                  )}>
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-3 border-t border-stone-200 dark:border-stone-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300">
          {user?.name?.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate">{user?.name}</div>
          <div className="text-[10px] text-stone-500">{user?.role}</div>
        </div>
        <button onClick={logout}
          className="text-xs text-stone-400 hover:text-red-500 transition-colors">
          Out
        </button>
      </div>
    </aside>
  )
}
