"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { applyTranslationOverrides } from "../lib/i18n/apply-db-overrides";

/** Подмешивает строки из БД поверх `resources.ts` после монтирования. */
export function I18nOverridesLoader() {
  const { i18n } = useTranslation();

  useEffect(() => {
    void applyTranslationOverrides(i18n, i18n.language);
  }, [i18n, i18n.language]);

  return null;
}
