"use client";

import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";
import { uiLangRuAz } from "./ui-lang";

// Defensive: old builds could store "AZ"/"RU" in localStorage.
// i18next `cleanCode` helps, but we also normalize persisted value to avoid surprises.
try {
  const k = "dayday_i18n_lang";
  const v = localStorage.getItem(k);
  if (v) {
    const norm = v.trim().toLowerCase();
    if (norm && norm !== v) localStorage.setItem(k, norm);
  }
} catch {
  /* ignore */
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    /** Если код языка не распознан — только `az` (см. `ensureSupportedLanguage`). */
    fallbackLng: "az",
    supportedLngs: ["ru", "az"],
    // Normalize weird language codes from browser/localStorage like "AZ"/"RU" or "az-AZ"
    // to ensure we always match the bundled `resources` locales.
    cleanCode: true,
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "dayday_i18n_lang",
    },
  });

const SUPPORTED = new Set(["ru", "az"]);
const LANG_STORAGE_KEY = "dayday_i18n_lang";

function normalizeLanguageCode(lng: string | undefined | null): "ru" | "az" | null {
  if (!lng) return null;
  const short = lng.split("-")[0]?.trim().toLowerCase();
  if (!short) return null;
  if (SUPPORTED.has(short)) return short as "ru" | "az";
  return null;
}

function persistLanguage(lng: "ru" | "az") {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
}

// Self-healing: нормализуем к `ru` | `az` (всё неявное `ru` → `az`, см. `ui-lang.ts`).
function ensureSupportedLanguage() {
  const fixed = uiLangRuAz(i18n.language);
  persistLanguage(fixed);
  const current = normalizeLanguageCode(i18n.language);
  if (current !== fixed) {
    void i18n.changeLanguage(fixed);
  }
}

i18n.on("initialized", ensureSupportedLanguage);
i18n.on("languageChanged", () => {
  ensureSupportedLanguage();
});

export default i18n;
