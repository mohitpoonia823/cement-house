import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppLanguage = 'en' | 'hi' | 'hinglish'

interface LocaleState {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'cement-house-locale',
    }
  )
)

