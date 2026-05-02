/**
 * TZ §17: scan apps/web/app and apps/web/components for t("...") and
 * <Trans i18nKey="..." />; require non-empty RU + AZ in resources; EN warns only.
 */
import fs from "node:fs";
import path from "node:path";
import { resources } from "../apps/web/lib/i18n/resources";

const SCAN_ROOTS = [
  path.join(process.cwd(), "apps/web/app"),
  path.join(process.cwd(), "apps/web/components"),
  /** Ключи в `lib/` (api-client, контексты и т.д.) тоже должны быть в RU/AZ. */
  path.join(process.cwd(), "apps/web/lib"),
];

const ru = resources.ru.translation as Record<string, unknown>;
const az = resources.az.translation as Record<string, unknown>;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === ".next" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function getLeaf(
  tree: Record<string, unknown>,
  keyPath: string,
): unknown {
  const parts = keyPath.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isRenderableString(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

function extractTKeys(source: string): Set<string> {
  const out = new Set<string>();
  const re = /\bt\s*\(\s*["']([^"'\\]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.add(m[1]!);
  }
  return out;
}

function extractTransKeys(source: string): Set<string> {
  const out = new Set<string>();
  const re = /i18nKey\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.add(m[1]!);
  }
  return out;
}

function main(): void {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const f of walk(root)) {
      if (!seen.has(f)) {
        seen.add(f);
        files.push(f);
      }
    }
  }
  const missingRu: string[] = [];
  const missingAz: string[] = [];
  const notString: string[] = [];

  for (const full of files) {
    const rel = path.relative(process.cwd(), full);
    const text = fs.readFileSync(full, "utf8");
    const keys = new Set([...extractTKeys(text), ...extractTransKeys(text)]);
    for (const key of keys) {
      const ruVal = getLeaf(ru, key);
      const azVal = getLeaf(az, key);
      if (!isRenderableString(ruVal)) {
        missingRu.push(`${rel} → ${key}`);
      }
      if (!isRenderableString(azVal)) {
        missingAz.push(`${rel} → ${key}`);
      }
      if (
        (ruVal != null && typeof ruVal !== "string") ||
        (azVal != null && typeof azVal !== "string")
      ) {
        notString.push(`${rel} → ${key}`);
      }
    }
  }

  if (missingRu.length) {
    console.error("\n--- Missing or empty RU ---");
    for (const line of missingRu) console.error(line);
  }
  if (missingAz.length) {
    console.error("\n--- Missing or empty AZ ---");
    for (const line of missingAz) console.error(line);
  }
  if (notString.length) {
    console.error("\n--- Non-string values (check nesting) ---");
    for (const line of notString) console.error(line);
  }

  if (!missingRu.length && !missingAz.length && !notString.length) {
    console.info(
      `i18n audit: OK (RU + AZ) for ${files.length} file(s) under apps/web/app, components, lib.`,
    );
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
