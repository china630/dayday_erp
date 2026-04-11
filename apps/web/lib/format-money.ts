/**
 * Формат как в АР: пробел как разделитель тысяч, запятая — дробная часть, символ ₼.
 */
export function formatMoneyAzn(value: unknown): string {
  if (value == null) return "—";
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "object" && value !== null && "toString" in value) {
    n = Number(String((value as { toString(): string }).toString()).replace(/\s/g, "").replace(",", "."));
  } else {
    n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  }
  if (Number.isNaN(n)) return "—";
  const s = new Intl.NumberFormat("az-AZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${s.replace(/\u00a0/g, " ")} ₼`;
}
