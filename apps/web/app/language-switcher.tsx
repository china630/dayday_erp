"use client";

import { useTranslation } from "react-i18next";
import { uiLangRuAz } from "../lib/i18n/ui-lang";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span>{t("language")}:</span>
      <select
        value={uiLangRuAz(i18n.language)}
        onChange={(e) => {
          const lng = e.target.value;
          void i18n.changeLanguage(lng);
          try {
            localStorage.setItem("dayday_i18n_lang", lng);
          } catch {
            /* ignore */
          }
        }}
        style={{ padding: "4px 8px" }}
      >
        <option value="ru">{t("ru")}</option>
        <option value="az">{t("az")}</option>
      </select>
    </label>
  );
}
