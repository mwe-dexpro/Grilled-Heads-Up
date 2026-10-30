import de from "./de.json";
import en from "./en.json";

export type TranslationKey = keyof typeof en;
export type Language = "en" | "de";

export const translations: Record<Language, Record<TranslationKey, string>> = { en, de };
export const languages = Object.keys(translations) as Language[];
export const defaultLanguage: Language = "en";

const storageKey = "language";

export function translate(
  language: Language,
  key: TranslationKey,
  params: Record<string, string> = {},
): string {
  return translations[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? params[name] : placeholder,
  );
}

export function loadLanguage(storage: Pick<Storage, "getItem">): Language {
  const saved = storage.getItem(storageKey);
  return languages.find((language) => language === saved) ?? defaultLanguage;
}

export function saveLanguage(storage: Pick<Storage, "setItem">, language: Language): void {
  storage.setItem(storageKey, language);
}
