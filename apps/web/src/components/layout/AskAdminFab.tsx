'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

function MessageCircleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.28 0-2.49-.28-3.58-.77L3 21l1.8-5.56A8.47 8.47 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function AskAdminFab() {
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const createTicket = useMutation({
    mutationFn: (payload: { subject?: string; message: string }) =>
      api.post('/api/support/tickets', payload).then((res) => res.data.data as { ticketId: string }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['support', 'tickets'] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications'] })
      qc.invalidateQueries({ queryKey: ['support', 'notifications', 'unread-count'] })
      setOpen(false)
      setSubject('')
      setMessage('')
      router.push(`/tickets?ticketId=${data.ticketId}`)
    },
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,23,42,0.22)] hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
      >
        <MessageCircleIcon className="h-3 w-3" />
        Need Help
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/35 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[24px] border border-white/70 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.24)] dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-3 inline-flex items-center gap-2 text-lg font-semibold text-slate-950 dark:text-slate-100">
              <MessageCircleIcon className="h-5 w-5" />
              Need Help
            </div>
            <div className="mb-3 text-sm text-slate-600 dark:text-slate-300">Send your query. Admin team will reply in tickets.</div>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const text = message.trim()
                if (!text) return
                const sub = subject.trim()
                createTicket.mutate({ ...(sub ? { subject: sub } : {}), message: text })
              }}
              className="space-y-3"
            >
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject (optional)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Type your query..."
                className="min-h-[130px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTicket.isPending}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950"
                >
                  {createTicket.isPending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
