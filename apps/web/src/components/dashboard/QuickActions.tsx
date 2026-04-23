import Link from 'next/link'

interface Action {
  label: string
  sub: string
  href: string
  iconBg: string
  icon: React.ReactNode
}

const actions: Action[] = [
  {
    label: 'New order',
    sub: 'Create sales order',
    href: '/orders/new',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 2v10M2 7h10" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Record payment',
    sub: 'Update Khata',
    href: '/khata',
    iconBg: 'bg-teal-50 dark:bg-teal-900/30',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="3" width="12" height="8" rx="1" stroke="#0D9488" strokeWidth="1.2"/>
        <path d="M1 6h12" stroke="#0D9488" strokeWidth="1.2"/>
      </svg>
    ),
  },
  {
    label: 'Stock purchase',
    sub: 'Add inventory',
    href: '/inventory',
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="#D97706" strokeWidth="1.2"/>
        <path d="M7 5v4M5 7h4" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Create delivery',
    sub: 'Dispatch challan',
    href: '/delivery',
    iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 7h10M8 4l3 3-3 3" stroke="#7C3AED" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Send reminders',
    sub: 'Bulk WhatsApp',
    href: '/customers',
    iconBg: 'bg-red-50 dark:bg-red-900/30',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M6 2a4 4 0 014 4v3l1 1H3l1-1V6a4 4 0 014-4zM5 10v1a2 2 0 004 0v-1" stroke="#DC2626" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export function QuickActions() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      <div className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-2">Quick actions</div>

      {actions.map((a, i) => (
        <Link
          key={a.href}
          href={a.href}
          className={`flex items-center justify-between py-2.5 cursor-pointer group ${
            i < actions.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${a.iconBg}`}>
              {a.icon}
            </div>
            <div>
              <div className="text-xs font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {a.label}
              </div>
              <div className="text-[10px] text-gray-400">{a.sub}</div>
            </div>
          </div>
          <span className="text-gray-300 dark:text-gray-600 group-hover:text-blue-400 text-sm transition-colors">→</span>
        </Link>
      ))}
    </div>
  )
}
