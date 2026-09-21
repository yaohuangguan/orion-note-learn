import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'zh' | 'en'
const LANGUAGE_KEY = 'orion-language'

function savedLanguage(): Language {
  const saved = localStorage.getItem(LANGUAGE_KEY)
  return saved === 'en' || saved === 'zh' ? saved : 'zh'
}

export function currentLanguage(): Language {
  return savedLanguage()
}

type I18nValue = {
  language: Language
  locale: 'zh-CN' | 'en-US'
  setLanguage: (language: Language) => void
  pick: (chinese: string, english: string) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(savedLanguage)
  const setLanguage = useCallback((next: Language) => {
    localStorage.setItem(LANGUAGE_KEY, next)
    setLanguageState(next)
  }, [])
  const pick = useCallback(
    (chinese: string, english: string) => (language === 'zh' ? chinese : english),
    [language],
  )
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])
  const value = useMemo<I18nValue>(
    () => ({ language, locale: language === 'zh' ? 'zh-CN' : 'en-US', setLanguage, pick }),
    [language, pick, setLanguage],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('I18nProvider is missing')
  return value
}
