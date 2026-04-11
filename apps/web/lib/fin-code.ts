/** ФИН: 7 символов, без латинских I и O. */
export const FIN_CODE_PATTERN = /^[0-9A-HJ-NP-Za-hj-np-z]{7}$/;

export function isValidFinCode(s: string): boolean {
  return FIN_CODE_PATTERN.test((s ?? "").trim());
}
