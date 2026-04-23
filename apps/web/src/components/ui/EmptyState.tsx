export function EmptyState({ title, sub, action }: {
  title: string; sub?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 mb-3 flex items-center justify-center">
        <div className="w-4 h-0.5 bg-stone-300 rounded" />
      </div>
      <div className="text-sm font-medium text-stone-700 dark:text-stone-300">{title}</div>
      {sub && <div className="text-xs text-stone-400 mt-1">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
