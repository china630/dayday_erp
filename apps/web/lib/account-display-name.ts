import { uiLangRuAz } from "./i18n/ui-lang";

export type AccountNameFields = {
  nameAz: string;
  nameRu: string;
  nameEn: string;
};

/** Согласовано с `pickAccountDisplayName` в `@dayday/database`. Только `ru` | `az` (см. `ui-lang.ts`). */
export function accountDisplayName(
  row: AccountNameFields,
  locale: string | undefined,
): string {
  if (uiLangRuAz(locale) === "ru") return row.nameRu || row.nameAz;
  return row.nameAz || row.nameRu;
}
