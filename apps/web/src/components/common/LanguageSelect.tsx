'use client'
import { useLocaleStore } from '@/store/locale'
import { useI18n } from '@/lib/i18n'

export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const language = useLocaleStore((s) => s.language)
  const setLanguage = useLocaleStore((s) => s.setLanguage)

  return (
    <label className="inline-flex items-center gap-2">
      {!compact ? <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{t('language.label')}</span> : null}
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'hi' | 'hinglish')}
        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <option value="en">{t('language.english')}</option>
        <option value="hi">{t('language.hindi')}</option>
        <option value="hinglish">{t('language.hinglish')}</option>
      </select>
    </label>
  )
}

