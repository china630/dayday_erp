import type { i18n as I18nType } from "i18next";

/**
 * Убирает из плоского списка «короткие» ключи, если есть более длинные с тем же префиксом.
 * Иначе при сборке в дерево значение `banking.cash` может затереть весь объект `banking.cash.*`.
 */
export function dropFlatKeysShadowedByLongerKeys(
  flat: Record<string, string>,
): Record<string, string> {
  const keys = Object.keys(flat);
  const drop = new Set<string>();
  for (const k of keys) {
    for (const other of keys) {
      if (other !== k && other.startsWith(`${k}.`)) {
        drop.add(k);
        break;
      }
    }
  }
  return Object.fromEntries(
    Object.entries(flat).filter(([key]) => !drop.has(key)),
  );
}

/**
 * В БД иногда сохраняют один корневой ключ (`hrTimesheet`, `timesheet` и т.д.) как строку —
 * при merge он затирает весь объект из resources.ts, и `t("hrTimesheet.title")` показывает ключ.
 * Корректные оверрайды идут как `hrTimesheet.title`, `timesheet.loadErr`, …
 */
const NESTED_TRANSLATION_ROOTS = new Set([
  "banking",
  "BANKING",
  "headerStrip",
  "hrTimesheet",
  "superAdmin",
  "timesheet",
]);

/**
 * В БД иногда сохраняют родительский ключ как одну строку (например `banking.cash` = «Касса»).
 * При merge он затирает весь объект из `resources.ts` (`banking.cash.*`), и `t("banking.cash.pageTitle")`
 * начинает показывать сырой ключ. Такие «короткие» пути нужно игнорировать — корректные оверрайды
 * идут листьями: `banking.cash.pageTitle`, …
 */
const FLAT_OVERRIDE_KEYS_THAT_SHADOW_NESTED_OBJECTS = new Set([
  "banking.cash",
  "BANKING.CASH",
]);

export function dropFlatKeysThatShadowNestedObjects(
  flat: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(flat).filter(
      ([k]) => !FLAT_OVERRIDE_KEYS_THAT_SHADOW_NESTED_OBJECTS.has(k),
    ),
  );
}

export function dropFlatRootStringNamespaceKeys(
  flat: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(flat).filter(([k]) => {
      if (k.includes(".")) return true;
      return !NESTED_TRANSLATION_ROOTS.has(k);
    }),
  );
}

/** Плоские ключи вида `nav.home` → вложенный объект для addResourceBundle. */
export function flatOverridesToNested(
  flat: Record<string, string>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const sorted = Object.entries(flat).sort(
    ([a], [b]) => b.split(".").length - a.split(".").length,
  );
  for (const [key, value] of sorted) {
    const parts = key.split(".").filter(Boolean);
    if (parts.length === 0) continue;
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const next = cur[p];
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        cur[p] = {};
      }
      cur = cur[p] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    const existing = cur[leaf];
    if (
      typeof value === "string" &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      Object.keys(existing as object).length > 0
    ) {
      continue;
    }
    cur[leaf] = value;
  }
  return root;
}

export async function applyTranslationOverrides(
  i18n: I18nType,
  locale: string,
): Promise<void> {
  const short =
    (i18n.resolvedLanguage ?? locale).split("-")[0]?.toLowerCase() ?? "ru";
  const loc =
    short === "az" ? "az" : short === "en" ? "en" : "ru";
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
  const res = await fetch(
    `${base}/api/public/translations?locale=${encodeURIComponent(loc)}`,
    { credentials: "include" },
  );
  if (!res.ok) return;
  const data = (await res.json()) as {
    overrides?: Record<string, string>;
  };
  const flat = dropFlatRootStringNamespaceKeys(
    dropFlatKeysThatShadowNestedObjects(
      dropFlatKeysShadowedByLongerKeys(data.overrides ?? {}),
    ),
  );
  if (Object.keys(flat).length === 0) return;
  const nested = flatOverridesToNested(flat);
  const lng = i18n.resolvedLanguage ?? loc;
  /** overwrite: false — не затирать строки из resources.ts при частичных оверрайдах из БД */
  await i18n.addResourceBundle(lng, "translation", nested, true, false);
}
