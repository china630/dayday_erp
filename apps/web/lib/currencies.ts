/**
 * Единый справочник валют для форм (счета, касса, закупки, реквизиты).
 * Значение по умолчанию в UI — {@link DEFAULT_CURRENCY}.
 */
export const SUPPORTED_CURRENCIES = ["AZN", "USD", "EUR", "RUB", "TRY"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: SupportedCurrency = "AZN";

export function isSupportedCurrency(v: string): v is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

export function coerceSupportedCurrency(v: string | undefined | null): SupportedCurrency {
  const u = String(v ?? "")
    .trim()
    .toUpperCase();
  return isSupportedCurrency(u) ? u : DEFAULT_CURRENCY;
}
