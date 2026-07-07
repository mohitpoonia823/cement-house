'use client'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ExportCsvButtonProps {
  page: string
  params?: Record<string, string | undefined>
  label?: string
  className?: string
}

export function ExportCsvButton({ page, params, label, className }: ExportCsvButtonProps) {
  const { t, language } = useI18n()
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    try {
      setIsExporting(true)
      const token = window.localStorage.getItem('auth_token')
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
      const query = new URLSearchParams()
      query.set('page', page)
      query.set('format', 'csv')
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value))
      }

      const response = await fetch(`${baseUrl}/api/reports/export?${query.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (body?.code === 'LIMIT_EXCEEDED' || body?.code === 'FEATURE_BLOCKED') {
          window.alert(
            language === 'hi'
              ? 'एक्सपोर्ट आपके वर्तमान प्लान में उपलब्ध नहीं है। एक्सपोर्ट पाने के लिए प्लान अपग्रेड करें।'
              : language === 'hinglish'
              ? 'Export aapke current plan me available nahi hai. Export ke liye plan upgrade karo.'
              : 'Exports are not available on your current plan. Upgrade your plan to enable exports.'
          )
          return
        }
        if (body?.code === 'PLAN_EXPIRED') {
          window.alert(
            language === 'hi'
              ? 'आपका प्लान समाप्त हो गया है। कृपया सब्सक्रिप्शन रिन्यू करें।'
              : language === 'hinglish'
              ? 'Aapka plan expire ho gaya hai. Please subscription renew karo.'
              : 'Your plan has expired. Please renew your subscription.'
          )
          return
        }
        throw new Error(body?.error ?? `Export failed with status ${response.status}`)
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
      window.alert(
        language === 'hi'
          ? 'एक्सपोर्ट विफल हुआ। कृपया फिर से प्रयास करें।'
          : language === 'hinglish'
          ? 'Export fail hua. Please dobara try karo.'
          : 'Export failed. Please try again.'
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isExporting}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white/75 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800',
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v11M8 10l4 4 4-4M5 21h14" />
      </svg>
      {isExporting ? t('top.exporting') : label ?? t('top.exportCsv')}
    </button>
  )
}
