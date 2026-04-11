/**
 * Регенерация снимка дефолтных переводов из web/lib/i18n/resources.ts
 * в src/admin/i18n-default-catalog-data.json.
 * Запуск из каталога apps/api: npx tsx scripts/gen-i18n-defaults.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { resources } from "../../web/lib/i18n/resources";

function flattenStrings(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenStrings(v as Record<string, unknown>, key));
    } else if (typeof v === "string") {
      out[key] = v;
    }
  }
  return out;
}

const outPath = join(process.cwd(), "src/admin/i18n-default-catalog-data.json");

const ru = flattenStrings(
  (resources.ru as { translation: Record<string, unknown> }).translation,
);
const az = flattenStrings(
  (resources.az as { translation: Record<string, unknown> }).translation,
);

writeFileSync(outPath, JSON.stringify({ ru, az }));
process.stdout.write(
  `Wrote ${outPath} (${Object.keys(ru).length} ru, ${Object.keys(az).length} az keys)\n`,
);
