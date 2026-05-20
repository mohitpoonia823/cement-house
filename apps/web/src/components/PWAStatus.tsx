'use client'

import { useEffect, useState } from 'react'

type SwNotice = {
  type: 'API_NETWORK_OK' | 'API_CACHE_FALLBACK' | 'API_CACHE_MISS'
  path?: string
}

export function PWAStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const [cachedNotice, setCachedNotice] = useState<string>('')
  const [missNotice, setMissNotice] = useState<string>('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsOnline(window.navigator.onLine)

    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    const onSwMessage = (event: MessageEvent<SwNotice>) => {
      const msg = event.data
      if (!msg?.type) return
      if (msg.type === 'API_CACHE_FALLBACK') {
        setCachedNotice(`Offline mode: showing cached data (${msg.path ?? 'data'}).`)
        setMissNotice('')
      } else if (msg.type === 'API_CACHE_MISS') {
        setMissNotice(`Offline and no cached data available (${msg.path ?? 'request'}).`)
      } else if (msg.type === 'API_NETWORK_OK') {
        setCachedNotice('')
        setMissNotice('')
      }
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    navigator.serviceWorker?.addEventListener('message', onSwMessage as EventListener)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      navigator.serviceWorker?.removeEventListener('message', onSwMessage as EventListener)
    }
  }, [])

  useEffect(() => {
    if (!cachedNotice) return
    const t = window.setTimeout(() => setCachedNotice(''), 5000)
    return () => window.clearTimeout(t)
  }, [cachedNotice])

  return (
    <>
      <div className="pointer-events-none fixed right-3 top-3 z-[130] flex flex-col items-end gap-2">
        {!isOnline ? (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
            Offline
          </span>
        ) : null}
      </div>

      {cachedNotice ? (
        <div className="fixed bottom-20 left-1/2 z-[130] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-sky-300/70 bg-sky-50 px-4 py-2 text-sm text-sky-900 shadow-lg dark:border-sky-500/30 dark:bg-slate-900 dark:text-sky-200">
          {cachedNotice}
        </div>
      ) : null}

      {missNotice ? (
        <div className="fixed bottom-20 left-1/2 z-[131] w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-rose-300/70 bg-rose-50 px-4 py-2 text-sm text-rose-900 shadow-lg dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200">
          {missNotice}
        </div>
      ) : null}
    </>
  )
}

