import catalog from "./i18n-default-catalog-data.json";

type CatalogFile = { ru: Record<string, string>; az: Record<string, string> };

const data = catalog as CatalogFile;

/**
 * Плоский словарь дефолтных строк i18n для локали (снимок из web/lib/i18n/resources.ts).
 * Обновление: из каталога apps/api выполнить `npm run gen:i18n-catalog`.
 * `en` в resources нет — используем ru как запасной вариант.
 */
export function getDefaultFlatTranslations(locale: string): Record<string, string> {
  const loc = locale.trim().toLowerCase();
  if (loc === "ru" || loc === "az") {
    return data[loc];
  }
  return data.ru;
}
