/** Нормализация VÖEN для сравнения (10 цифр). */
export function normalizeVoen(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.slice(-10).padStart(10, "0");
}
