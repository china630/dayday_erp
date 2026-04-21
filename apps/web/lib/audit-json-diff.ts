export type AuditDiffRow = {
  path: string;
  oldValue: unknown;
  newValue: unknown;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Shallow-deep walk: lists added/removed/changed leaf values (no array diff semantics).
 */
export function buildJsonDiff(
  oldValues: unknown,
  newValues: unknown,
): AuditDiffRow[] {
  const rows: AuditDiffRow[] = [];

  function walk(a: unknown, b: unknown, path: string) {
    if (a === b) {
      return;
    }
    if (Number.isNaN(a) && Number.isNaN(b)) {
      return;
    }
    if (!isPlainObject(a) || !isPlainObject(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        rows.push({ path: path || ".", oldValue: a, newValue: b });
      }
      return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (!(k in a)) {
        rows.push({ path: p, oldValue: undefined, newValue: b[k] });
      } else if (!(k in b)) {
        rows.push({ path: p, oldValue: a[k], newValue: undefined });
      } else {
        walk(a[k], b[k], p);
      }
    }
  }

  walk(oldValues, newValues, "");
  return rows;
}
