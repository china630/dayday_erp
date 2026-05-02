/**
 * Допустимые ставки ƏDV/НДС для строк документов и номенклатуры (синхрон с API `CreateInvoiceItemDto` / продукт).
 * -1 — освобождение (в расчётах как 0%).
 */
export const INVOICE_VAT_RATE_VALUES = [-1, 0, 2, 8, 18] as const;

export type InvoiceVatRateValue = (typeof INVOICE_VAT_RATE_VALUES)[number];

export type VatRateFormString = "-1" | "0" | "2" | "8" | "18";

export function vatRateToFormString(v: InvoiceVatRateValue): VatRateFormString {
  return String(v) as VatRateFormString;
}

export function formStringToVatRate(s: string): InvoiceVatRateValue | null {
  const n = Number(s);
  for (const x of INVOICE_VAT_RATE_VALUES) {
    if (x === n) return x;
  }
  return null;
}

export function normalizeProductVatRate(raw: number): InvoiceVatRateValue {
  if (raw === -1) return -1;
  if (raw === 0) return 0;
  if (raw === 2) return 2;
  if (raw === 8) return 8;
  return 18;
}

/** Процент для расчёта сумм (освобождение → 0%). */
export function vatPercentForMath(rate: InvoiceVatRateValue): number {
  if (rate === -1) return 0;
  return rate;
}
