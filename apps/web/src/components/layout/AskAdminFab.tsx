'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SupportAssistantPanel } from '@/components/support/SupportAssistantPanel'
import { useI18n } from '@/lib/i18n'

function SparkIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 3v4m0 10v4m9-9h-4M7 12H3m14.5-6.5-2.8 2.8M9.3 14.7l-2.8 2.8m11 0-2.8-2.8M9.3 9.3 6.5 6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AskAdminFab() {
  const router = useRouter()
  const { language } = useI18n()
  const t = (en: string, hi: string, hinglish?: string) =>
    language === 'hi' ? hi : language === 'hinglish' ? (hinglish ?? en) : en
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-30 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)] hover:opacity-95 xl:bottom-5"
      >
        <SparkIcon className="h-4 w-4" />
        {t('Ask AI', 'एआई से पूछें', 'AI se poocho')}
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[24px] border border-white/70 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.24)] dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                {t('Help', 'मदद', 'Help')}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {t('Close', 'बंद करें', 'Band karo')}
              </button>
            </div>
            <SupportAssistantPanel
              variant="modal"
              onEscalated={(ticketId) => {
                setOpen(false)
                router.push(`/tickets?ticketId=${ticketId}`)
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
