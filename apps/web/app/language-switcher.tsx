"use client";

import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span>{t("language")}:</span>
      <select
        value={i18n.language.startsWith("az") ? "az" : "ru"}
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
