import { cn } from '@/lib/utils'

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'default'

const styles: Record<Variant, string> = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  danger:  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  info:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  default: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
}

export function Badge({ children, variant = 'default', className }: {
  children: React.ReactNode; variant?: Variant; className?: string
}) {
  return (
    <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded', styles[variant], className)}>
      {children}
    </span>
  )
}

export function statusBadge(status: string) {
  const map: Record<string, Variant> = {
    DELIVERED: 'success', CONFIRMED: 'info', DISPATCHED: 'warning',
    CANCELLED: 'danger',  DRAFT: 'default', IN_TRANSIT: 'warning',
    SCHEDULED: 'info', FAILED: 'danger', RELIABLE: 'success',
    WATCH: 'warning', BLOCKED: 'danger', OK: 'success', LOW: 'warning',
    OUT_OF_STOCK: 'danger', ACTIVE: 'success', TRIAL: 'info',
    PAST_DUE: 'warning', SUSPENDED: 'danger',
  }
  return map[status] ?? 'default'
}
