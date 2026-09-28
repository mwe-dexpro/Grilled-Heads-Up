import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  defaultLanguage,
  loadLanguage,
  saveLanguage,
  translate,
  type Language,
  type TranslationKey,
} from "./i18n";

interface I18n {
  language: Language;
  setLanguage(language: Language): void;
  t(key: TranslationKey, params?: Record<string, string>): string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLanguage(): Language {
  try {
    return loadLanguage(localStorage);
  } catch {
    return defaultLanguage;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      saveLanguage(localStorage, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this session.
    }
  }, []);

  const t = useCallback<I18n["t"]>((key, params) => translate(language, key, params), [language]);

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error("useI18n must be used inside <I18nProvider>");
  return i18n;
}
