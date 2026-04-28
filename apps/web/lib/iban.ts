export type IbanValidationResult = {
  isValid: boolean;
  normalized: string;
  reason?: string;
};

/**
 * Azerbaijan IBAN format: AZ + 26 alphanumeric chars (total 28).
 * Checksum algorithm: MOD-97.
 */
export function validateAzIban(ibanRaw: string): IbanValidationResult {
  const normalized = ibanRaw.replace(/\s+/g, "").toUpperCase();
  if (!normalized) return { isValid: false, normalized, reason: "empty" };
  if (!/^AZ[A-Z0-9]{26}$/.test(normalized)) {
    return { isValid: false, normalized, reason: "format" };
  }
  const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`;
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of digits) {
      remainder = (remainder * 10 + Number(d)) % 97;
    }
  }
  return { isValid: remainder === 1, normalized, reason: remainder === 1 ? undefined : "checksum" };
}

