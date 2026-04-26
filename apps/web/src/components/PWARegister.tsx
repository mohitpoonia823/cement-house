'use client'

import { useEffect, useMemo, useState } from 'react'
import { BeforeInstallPromptEvent, setDeferredInstallPrompt } from '@/lib/pwa-install'

type InstallTarget = 'android' | 'ios' | 'desktop' | 'other'

const INSTALL_BANNER_DISMISSED_KEY = 'cement-house-install-banner-dismissed-v1'

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

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  const iosStandalone = Boolean((window.navigator as any).standalone)
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches
  return iosStandalone || displayModeStandalone
}

export function PWARegister() {
  const [installTarget, setInstallTarget] = useState<InstallTarget>('other')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isPrompting, setIsPrompting] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('SW registered:', reg.scope))
        .catch((err) => console.log('SW registration failed:', err))
    }

    const dismissed = typeof window !== 'undefined' && window.localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === '1'
    if (!isStandaloneMode() && !dismissed) {
      setInstallTarget(detectInstallTarget())
      setIsVisible(true)
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      setDeferredPrompt(promptEvent)
      setDeferredInstallPrompt(promptEvent)
      if (!isStandaloneMode() && !dismissed) setIsVisible(true)
    }

    const onAppInstalled = () => {
      setIsVisible(false)
      setDeferredPrompt(null)
      setDeferredInstallPrompt(null)
      window.localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const canPromptInstall = Boolean(deferredPrompt) && (installTarget === 'android' || installTarget === 'desktop')
  const canShowBanner = isVisible && !isStandaloneMode()

  const content = useMemo(() => {
    if (installTarget === 'android') {
      return {
        title: 'Install app on Android',
        description: canPromptInstall
          ? 'Tap Install App to add Cement House on your home screen.'
          : 'Use browser menu and tap Install app or Add to Home screen.',
        actionLabel: 'Install App',
      }
    }
    if (installTarget === 'ios') {
      return {
        title: 'Add to Home Screen on iPhone/iPad',
        description: 'Tap Share, then choose Add to Home Screen.',
        actionLabel: '',
      }
    }
    if (installTarget === 'desktop') {
      return {
        title: 'Install desktop app',
        description: canPromptInstall
          ? 'Install Cement House as a desktop app for faster access.'
          : 'Use browser menu and choose Install app.',
        actionLabel: 'Install Desktop App',
      }
    }
    return {
      title: 'Install app',
      description: 'Use your browser menu to install Cement House.',
      actionLabel: '',
    }
  }, [installTarget, canPromptInstall])

  async function handleInstall() {
    if (!deferredPrompt) return
    try {
      setIsPrompting(true)
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
      setDeferredInstallPrompt(null)
      setIsVisible(false)
      window.localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1')
    } finally {
      setIsPrompting(false)
    }
  }

  if (!canShowBanner) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] md:inset-x-6 md:bottom-5">
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)] backdrop-blur dark:border-slate-700/90 dark:bg-slate-950/92">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950 dark:text-white">{content.title}</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{content.description}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsVisible(false)
              window.localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1')
            }}
            className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Dismiss install banner"
          >
            Close
          </button>
        </div>

        {canPromptInstall ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleInstall}
              disabled={isPrompting}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300"
            >
              {isPrompting ? 'Opening...' : content.actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
