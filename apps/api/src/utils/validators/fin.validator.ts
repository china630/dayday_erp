export const AZ_FIN_CODE_PATTERN = /^[A-HJ-NP-Z0-9]{7}$/;

/**
 * Azerbaijan FIN format:
 * - exactly 7 chars
 * - latin uppercase letters and digits
 * - letters I and O are excluded
 */
export function isValidAzFinCode(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return AZ_FIN_CODE_PATTERN.test(normalized);
}

