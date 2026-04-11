/** Сериализация Prisma/Decimal/BigInt в JSON-совместимый вид для audit JSON. */
export function serializeForAudit(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (v instanceof Date) {
        return v.toISOString();
      }
      if (typeof v === "bigint") {
        return v.toString();
      }
      if (
        v &&
        typeof v === "object" &&
        typeof (v as { toFixed?: (n: number) => string }).toFixed === "function"
      ) {
        return String(v);
      }
      return v;
    }),
  );
}
