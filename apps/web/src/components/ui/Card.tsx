import { cn } from '@/lib/utils'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-white/60 bg-white/82 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-slate-950/70 dark:shadow-[0_24px_60px_rgba(2,6,23,0.45)]',
        className
      )}
    >
      {children}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  sub,
  subColor,
}: {
  label: string
  value: string
  sub?: string
  subColor?: string
}) {
  return (
    <div className="rounded-[24px] border border-white/60 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)]">
      <div className="mb-1 text-[11px] uppercase tracking-[0.24em] text-slate-300">{label}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className={cn('mt-1 text-xs', subColor ?? 'text-slate-300')}>{sub}</div>}
    </div>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && (
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
            {eyebrow}
          </div>
        )}
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function MetricGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
}

export function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'brand' | 'info'
}) {
  const accents = {
    default: 'text-slate-500 dark:text-slate-400',
    success: 'text-emerald-700 dark:text-emerald-300',
    warning: 'text-amber-700 dark:text-amber-300',
    danger: 'text-rose-700 dark:text-rose-300',
    brand: 'text-sky-700 dark:text-sky-300',
    info: 'text-blue-700 dark:text-blue-300',
  } as const

  return (
    <div
      className={cn(
        'rounded-[26px] border border-white/60 bg-white/84 p-5 text-slate-950 shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur dark:border-white/10 dark:bg-slate-950/70 dark:text-white'
      )}
    >
      <div className={cn('text-[11px] font-semibold uppercase tracking-[0.24em]', accents[tone])}>{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{hint}</div>}
    </div>
  )
}
