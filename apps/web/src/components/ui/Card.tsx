import { cn } from '@/lib/utils'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4', className)}>
      {children}
    </div>
  )
}

export function KpiCard({ label, value, sub, subColor }: {
  label: string; value: string; sub?: string; subColor?: string
}) {
  return (
    <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-3">
      <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">{label}</div>
      <div className="text-xl font-medium text-stone-900 dark:text-stone-100">{value}</div>
      {sub && <div className={cn('text-xs mt-1', subColor ?? 'text-stone-500')}>{sub}</div>}
    </div>
  )
}
