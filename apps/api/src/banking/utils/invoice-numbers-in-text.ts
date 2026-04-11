/**
 * Извлекает из текста номера счетов вида INV-YYYY-SEQ (как в nextInvoiceNumber).
 * SEQ нормализуется до 4 цифр для совпадения с БД (INV-2026-1 → INV-2026-0001).
 */
export function normalizeInvoiceNumberToken(raw: string): string {
  const m = /^INV-(\d{4})-(\d{1,6})$/i.exec(raw.trim());
  if (!m) return raw.trim().toUpperCase();
  const year = m[1];
  const seq = Number.parseInt(m[2], 10);
  if (Number.isNaN(seq)) return raw.trim().toUpperCase();
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * Уникальные нормализованные номера в порядке появления в тексте.
 */
export function extractInvoiceNumbersFromText(
  text: string | null | undefined,
): string[] {
  if (!text?.trim()) return [];
  const re = /\bINV-\d{4}-\d{1,6}\b/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const s = text;
  re.lastIndex = 0;
  while ((m = re.exec(s)) !== null) {
    const n = normalizeInvoiceNumberToken(m[0]);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
