/** Признак плательщика НДС организации в `Organization.settings.tax.isVatPayer`. */
export function parseOrgIsVatPayer(settings: unknown): boolean {
  if (settings == null || typeof settings !== "object") return false;
  const tax = (settings as Record<string, unknown>).tax;
  if (tax == null || typeof tax !== "object") return false;
  return Boolean((tax as Record<string, unknown>).isVatPayer);
}
