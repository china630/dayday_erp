import type { TFunction } from "i18next";

/** Локализованная подпись статуса счёта (Prisma `InvoiceStatus`), без сырого enum в UI. */
export function formatInvoiceStatus(t: TFunction, status: string): string {
  const key = `invoiceStatus.${status}`;
  return t(key, { defaultValue: status });
}
