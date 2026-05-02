/**
 * Два UI-языка DayDay: только явный `ru`, всё остальное (включая пустой код) — `az`.
 * Согласовано с `client-i18n.ts` / переключателем языка.
 */
export function uiLangRuAz(lang: string | undefined | null): "ru" | "az" {
  const s = String(lang ?? "")
    .split("-")[0]
    ?.trim()
    .toLowerCase();
  return s === "ru" ? "ru" : "az";
}

/** Локаль для `Intl` / `toLocaleString` по текущему `i18n.language`. */
export function intlLocaleRuAz(lang: string | undefined | null): "ru-RU" | "az-AZ" {
  return uiLangRuAz(lang) === "ru" ? "ru-RU" : "az-AZ";
}
