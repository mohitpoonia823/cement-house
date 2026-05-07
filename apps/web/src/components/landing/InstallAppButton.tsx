'use client'

import { useEffect, useMemo, useState } from 'react'
import { getDeferredInstallPrompt } from '@/lib/pwa-install'

type InstallTarget = 'android' | 'ios' | 'desktop' | 'other'

function detectInstallTarget(): InstallTarget {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent.toLowerCase()
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('macintosh') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  if (ua.includes('android')) return 'android'
  if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) return 'desktop'
  return 'other'
}

export function InstallAppButton() {
  const [target, setTarget] = useState<InstallTarget>('other')
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as any).standalone)
    setIsInstalled(standalone)
    setTarget(standalone ? 'other' : detectInstallTarget())
    const onInstalled = () => setIsInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  const label = useMemo(() => {
    if (target === 'ios') return 'Add to Home'
    return 'Install App'
  }, [target])

  async function handleInstall() {
    const prompt = getDeferredInstallPrompt()
    if (!prompt) {
      if (target === 'ios') {
        window.alert('On iPhone/iPad: tap Share, then choose Add to Home Screen.')
      } else {
        window.alert('Use your browser menu and choose Install app.')
      }
      return
    }
    await prompt.prompt()
    await prompt.userChoice
  }

  if (isInstalled || target === 'other') return null

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold leading-none text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 sm:min-h-10 sm:px-4 sm:text-sm"
    >
      {label}
    </button>
  )
}
