'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type ToastTone = 'success' | 'error' | 'info'
type Toast = { id: string; tone: ToastTone; message: string }
type ConfirmState = { title: string; body?: string } | null

type FeedbackContextValue = {
  pushToast: (message: string, tone?: ToastTone) => void
  confirm: (title: string, body?: string) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((prev) => [...prev, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3500)
  }, [])

  const closeConfirm = useCallback((value: boolean) => {
    resolver?.(value)
    setResolver(null)
    setConfirmState(null)
  }, [resolver])

  const confirm = useCallback((title: string, body?: string) => {
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve)
      setConfirmState({ title, body })
    })
  }, [])

  const value = useMemo(() => ({ pushToast, confirm }), [confirm, pushToast])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed right-3 top-16 z-[140] flex w-[min(92vw,360px)] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-lg ${
                toast.tone === 'success'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200'
                  : toast.tone === 'error'
                    ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-200'
                    : 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-200'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
      {confirmState ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="text-sm font-semibold text-slate-950 dark:text-white">{confirmState.title}</div>
            {confirmState.body ? <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{confirmState.body}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className="rounded-lg bg-slate-950 px-3 py-1.5 text-sm text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}
