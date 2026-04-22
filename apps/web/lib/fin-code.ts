/** ФИН: 7 символов, без латинских I и O. */
export const FIN_CODE_PATTERN = /^[0-9A-HJ-NP-Za-hj-np-z]{7}$/;

export function isValidFinCode(s: string): boolean {
  return FIN_CODE_PATTERN.test((s ?? "").trim());
}

// Common Cyrillic look-alikes users often type with RU keyboard.
const CYRILLIC_LOOKALIKES_TO_LATIN: Record<string, string> = {
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  У: "Y",
  Х: "X",
};

/**
 * Normalizes FIN input for better UX:
 * - trims to 7 chars,
 * - uppercases,
 * - maps common Cyrillic look-alikes to Latin,
 * - keeps only A-Z/0-9.
 */
export function normalizeFinInput(raw: string): string {
  const upper = (raw ?? "").toUpperCase();
  const mapped = upper
    .split("")
    .map((ch) => CYRILLIC_LOOKALIKES_TO_LATIN[ch] ?? ch)
    .join("");
  return mapped.replace(/[^0-9A-Z]/g, "").slice(0, 7);
}
