export type AccountNameFields = {
  nameAz: string;
  nameRu: string;
  nameEn: string;
};

/** Согласовано с `pickAccountDisplayName` в `@dayday/database`. */
export function accountDisplayName(
  row: AccountNameFields,
  locale: string | undefined,
): string {
  const raw = (locale ?? "az").trim().toLowerCase();
  const two = raw.startsWith("en") ? "en" : raw.startsWith("ru") ? "ru" : "az";
  if (two === "ru") return row.nameRu || row.nameAz;
  if (two === "en") return row.nameEn || row.nameAz;
  return row.nameAz || row.nameRu;
}
