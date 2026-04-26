import { fmt } from '@/lib/utils'

interface KpiItem {
  label: string
  value: string
  sub: string
  badge: string
  badgeType: 'up' | 'neutral' | 'down'
  accent: string
  icon: React.ReactNode
}

const badgeClasses = {
  up:      'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  neutral: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  down:    'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const kpis: KpiItem[] = [
  {
    label: "Today's sales",
    value: fmt(4200),
    sub: '1 order',
    badge: '+12% vs yesterday',
    badgeType: 'up',
    accent: 'bg-blue-500',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M1 10l3-4 3 2 5-6" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Cash collected',
    value: fmt(4200),
    sub: '1 payment',
    badge: '100% collected',
    badgeType: 'up',
    accent: 'bg-teal-500',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#0D9488" strokeWidth="1.2"/>
        <path d="M1 6h12" stroke="#0D9488" strokeWidth="1.2"/>
      </svg>
    ),
  },
  {
    label: 'Outstanding',
    value: fmt(0),
    sub: '0 parties',
    badge: 'All clear',
    badgeType: 'neutral',
    accent: 'bg-amber-500',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="#D97706" strokeWidth="1.2"/>
        <path d="M7 4v3l2 1.5" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Low stock alerts',
    value: '0',
    sub: 'materials',
    badge: 'All stocked',
    badgeType: 'neutral',
    accent: 'bg-red-500',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="#DC2626" strokeWidth="1.2"/>
        <path d="M7 5v4M5 7h4" stroke="#DC2626" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export function KpiRow() {
  return (
    <div className="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 relative overflow-hidden">
          {/* Accent bar */}
          <div className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-xl ${kpi.accent}`} />

          {/* Icon + label */}
          <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            {kpi.icon}
            {kpi.label}
          </div>

          {/* Value */}
          <div className="text-[22px] font-medium text-gray-900 dark:text-gray-100 leading-none mt-1.5">
            {kpi.value}
          </div>

          {/* Sub row + badge */}
          <div className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1.5">
            <span>{kpi.sub}</span>
            <span className={`rounded-full text-[10px] px-2 py-0.5 font-medium ${badgeClasses[kpi.badgeType]}`}>
              {kpi.badge}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
