/**
 * organizationId в Prisma — @db.Uuid. Пустые/невалидные значения дают ошибки клиента
 * (в т.ч. при некорректной сборке `where` для findUnique).
 */
const ORG_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOrganizationUuid(id: string): boolean {
  return ORG_ID_UUID_RE.test(id);
}

export function parseOrganizationId(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t === "undefined" || t === "null") return null;
  return t;
}

/** Готовый UUID для `where: { organizationId }` или null — не дергать Prisma. */
export function resolveOrganizationUuid(raw: unknown): string | null {
  const id = parseOrganizationId(raw);
  if (!id || !isOrganizationUuid(id)) return null;
  return id;
}
