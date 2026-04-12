/** Топ валют для дашборда: AZN за 1 единицу (официальный курс ЦБА). */
export const DASHBOARD_FX_CODES = [
  "USD",
  "EUR",
  "GBP",
  "RUB",
  "CNY",
  "TRY",
  "JPY",
] as const;

export type FxDashboardRateRow = {
  currencyCode: string;
  rate: number | null;
  value: number | null;
  nominal: number | null;
  rateDateBaku: string | null;
  isFallback: boolean;
  /** Нет ни live, ни строки в cbar_official_rates — в UI показать «—». */
  isUnavailable: boolean;
};
