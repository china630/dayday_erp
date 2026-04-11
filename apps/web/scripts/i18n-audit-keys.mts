import { resources } from "../lib/i18n/resources.ts";

function leafPaths(obj: unknown, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object") {
    out.push([prefix, String(obj)]);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(...leafPaths(v, p));
    } else {
      out.push([p, typeof v === "string" ? v : JSON.stringify(v)]);
    }
  }
  return out;
}

const ru = leafPaths(resources.ru.translation);
const az = leafPaths(resources.az.translation);
const ruMap = new Map(ru);
const azMap = new Map(az);
const ruKeys = new Set(ruMap.keys());
const azKeys = new Set(azMap.keys());
const onlyRu = [...ruKeys].filter((k) => !azKeys.has(k)).sort();
const onlyAz = [...azKeys].filter((k) => !ruKeys.has(k)).sort();
const sameLong = [...ruKeys].filter(
  (k) =>
    azKeys.has(k) &&
    ruMap.get(k) === azMap.get(k) &&
    (ruMap.get(k)?.length ?? 0) > 2,
);

const intentionalSame = new Set([
  "appTitle",
  "az",
  "ru",
  "language",
  "seo.title",
  "BANKING.CASH.COLORDERNO",
]);
const sameSuspect = sameLong
  .filter((k) => !intentionalSame.has(k) && !k.endsWith(".payButtonAz"))
  .sort();

console.log(JSON.stringify({ onlyRu, onlyAz, sameSuspect }, null, 2));
