'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { pageTitles } from './navigation'
import { useState } from 'react'

function exportPageForPath(pathname: string) {
  if (pathname.startsWith('/orders')) return 'orders'
  if (pathname.startsWith('/customers')) return 'customers'
  if (pathname.startsWith('/inventory')) return 'inventory'
  if (pathname.startsWith('/delivery')) return 'delivery'
  if (pathname.startsWith('/khata')) return 'khata'
  if (pathname.startsWith('/reports')) return 'reports'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'dashboard'
}

function exportLabel(page: string) {
  if (page === 'dashboard' || page === 'reports') return 'Export PDF'
  return 'Export CSV'
}

export function Topbar() {
  const pathname = usePathname()
  const title = pageTitles[pathname] ?? 'Cement House'
  const page = exportPageForPath(pathname)
  const [isExporting, setIsExporting] = useState(false)
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  async function handleExport() {
    try {
      setIsExporting(true)
      const token = window.localStorage.getItem('auth_token')
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const response = await fetch(`${baseUrl}/api/reports/export?page=${encodeURIComponent(page)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }

      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') ?? undefined
      const filenameMatch = disposition?.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? `${page}-snapshot`
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      window.alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <header className="sticky top-0 z-20 shrink-0 px-4 pb-4 pt-4 md:px-6">
      <div className="flex items-center justify-between rounded-[28px] border border-white/60 bg-white/75 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-slate-950/60">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
            Analytics workspace
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</span>
            <span className="text-sm text-slate-500 dark:text-slate-300">{today}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="hidden rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 md:inline-flex"
          >
            {isExporting ? 'Exporting...' : exportLabel(page)}
          </button>
          <Link
            href="/orders/new"
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            + New order
          </Link>
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto xl:hidden">
        <Link href="/dashboard" className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
          Overview
        </Link>
        <Link href="/orders" className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
          Orders
        </Link>
        <Link href="/customers" className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
          Customers
        </Link>
        <Link href="/inventory" className="rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
          Inventory
        </Link>
      </div>
    </header>
  )
}
