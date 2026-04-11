/** Извлекает отображаемое имя подписанта из subject (например CN=…). */
export function parseSignerDisplayName(
  certificateSubject: string | null | undefined,
): string | null {
  if (!certificateSubject?.trim()) return null;
  const m = /CN\s*=\s*([^,+]+)/i.exec(certificateSubject);
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : null;
}
