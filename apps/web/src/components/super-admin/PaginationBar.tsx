'use client'

export function PaginationBar({
  page,
  totalPages,
  total,
  label,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  label: string
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200/70 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-slate-500 dark:text-slate-300">
        {total} {label} • page {page} of {totalPages}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Next
        </button>
      </div>
    </div>
  )
}
