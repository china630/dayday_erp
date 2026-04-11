/** ФИН АР: 7 символов, латиница/цифры, без букв I и O (путаница с 1 и 0). */
export const FIN_CODE_PATTERN = /^[0-9A-HJ-NP-Za-hj-np-z]{7}$/;

export function isValidFinCode(s: string): boolean {
  return FIN_CODE_PATTERN.test((s ?? "").trim());
}
