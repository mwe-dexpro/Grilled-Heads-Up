import { describe, expect, it } from "vitest";
import { loadLanguage, saveLanguage, translate, translations } from "./i18n";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe("Translations", () => {
  it("has every text in both English and German, none left empty", () => {
    const englishKeys = Object.keys(translations.en).sort();
    const germanKeys = Object.keys(translations.de).sort();

    expect(englishKeys.length).toBeGreaterThan(0);
    expect(germanKeys).toEqual(englishKeys);
    for (const language of [translations.en, translations.de]) {
      for (const text of Object.values(language)) expect(text.trim()).not.toBe("");
    }
  });

  it("translates a text into the chosen language", () => {
    expect(translate("en", "task.add")).toBe("Add");
    expect(translate("de", "task.add")).toBe("Hinzufügen");
  });

  it("fills placeholders in a text", () => {
    expect(translate("en", "task.completeNamed", { title: "Bake cake" })).toBe("Complete Bake cake");
    expect(translate("de", "task.completeNamed", { title: "Bake cake" })).toBe("Bake cake erledigen");
  });

  it("uses English when no language was chosen yet", () => {
    expect(loadLanguage(memoryStorage())).toBe("en");
  });

  it("uses English when the remembered language is not supported", () => {
    expect(loadLanguage(memoryStorage({ language: "fr" }))).toBe("en");
  });

  it("remembers the chosen language", () => {
    const storage = memoryStorage();

    saveLanguage(storage, "de");

    expect(loadLanguage(storage)).toBe("de");
  });
});
