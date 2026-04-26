'use client'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    __cementHouseDeferredPrompt?: BeforeInstallPromptEvent | null
  }
}

const INSTALL_PROMPT_EVENT = 'cement-house-install-prompt-change'

export function setDeferredInstallPrompt(prompt: BeforeInstallPromptEvent | null) {
  if (typeof window === 'undefined') return
  window.__cementHouseDeferredPrompt = prompt
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT))
}

export function getDeferredInstallPrompt() {
  if (typeof window === 'undefined') return null
  return window.__cementHouseDeferredPrompt ?? null
}

export function subscribeInstallPromptChange(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(INSTALL_PROMPT_EVENT, callback)
  return () => window.removeEventListener(INSTALL_PROMPT_EVENT, callback)
}
