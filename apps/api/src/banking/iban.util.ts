export type IbanValidationResult = {
  isValid: boolean;
  normalized: string;
  reason?: string;
};

/**
 * Azerbaijan IBAN format: "AZ" + 26 alphanumeric chars => total length 28.
 * Validation: ISO 13616 MOD-97 (IBAN checksum).
 */
export function validateAzIban(ibanRaw: string): IbanValidationResult {
  const normalized = ibanRaw.replace(/\s+/g, "").toUpperCase();
  if (!normalized) {
    return { isValid: false, normalized, reason: "IBAN is empty" };
  }
  if (!/^AZ[A-Z0-9]{26}$/.test(normalized)) {
    return {
      isValid: false,
      normalized,
      reason: "AZ IBAN must start with AZ and contain 28 alphanumeric chars",
    };
  }

  const rearranged = `${normalized.slice(4)}${normalized.slice(0, 4)}`;
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const fragment = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const digit of fragment) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return {
    isValid: remainder === 1,
    normalized,
    reason: remainder === 1 ? undefined : "IBAN checksum failed (MOD-97)",
  };
}

