import type { i18n as I18nType } from "i18next";
import { COUNTERPARTY_LEGAL_FORMS } from "../counterparty-legal-form";
import { safeJson } from "../api-fetch";
import { uiLangRuAz } from "./ui-lang";

const COUNTERPARTY_LEGAL_FORM_ENUM = new Set<string>(COUNTERPARTY_LEGAL_FORMS);

/** Одна строка ключа — как в `normalizeTranslationOverrideFlat` (для аудита БД и сопоставления с пайплайном). */
export function normalizeTranslationOverrideKeyString(rawK: string): string | null {
  const k = rawK
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");
  if (!k) return null;
  const parts = k.split(".").filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(".");
}

/** Нормализация ключей из БД: trim, убрать ведущие/хвостовые точки, схлопнуть «..», иначе `nav.` проходит `includes('.')` и ломает весь объект `nav`. */
export function normalizeTranslationOverrideFlat(
  flat: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawK, v] of Object.entries(flat)) {
    const nk = normalizeTranslationOverrideKeyString(rawK);
    if (!nk) continue;
    out[nk] = String(v ?? "");
  }
  return out;
}

/**
 * Ключ после нормализации и ремапа ОПФ — как в `processTranslationOverridesFlat` до shadow/drop-шагов.
 * Нужен аудиту БД: сырой `counterparties.legalForm.LLC` в выходе пайплайна становится `counterparties.legalForm_LLC`.
 */
export function effectiveTranslationOverrideLookupKey(rawKey: string): string | null {
  const nk = normalizeTranslationOverrideKeyString(rawKey);
  if (!nk) return null;
  const m = /^counterparties\.legalForm\.([A-Za-z0-9_]+)$/.exec(nk);
  if (m) {
    const suf = m[1]!.toUpperCase();
    if (COUNTERPARTY_LEGAL_FORM_ENUM.has(suf)) {
      return `counterparties.legalForm_${suf}`;
    }
  }
  return nk;
}

/**
 * В БД иногда сохраняют ОПФ как `counterparties.legalForm.LLC` (точка перед суффиксом).
 * В `resources.ts` и в `t()` ключ — **`counterparties.legalForm_LLC`** (подчёркивание).
 * Иначе дерево получает `legalForm: { LLC: "…" }` и ломает соседние `legalForm_*` из бандла.
 */
export function remapCounterpartyLegalFormDottedKeys(
  flat: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...flat };
  for (const [k, v] of Object.entries(flat)) {
    const m = /^counterparties\.legalForm\.([A-Za-z0-9_]+)$/.exec(k);
    if (!m) continue;
    const suf = m[1]!.toUpperCase();
    if (!COUNTERPARTY_LEGAL_FORM_ENUM.has(suf)) continue;
    const fixed = `counterparties.legalForm_${suf}`;
    const val = String(v ?? "").trim();
    if (!val) {
      delete out[k];
      continue;
    }
    const curFixed = out[fixed];
    if (curFixed === undefined || String(curFixed).trim() === "") {
      out[fixed] = val;
    }
    delete out[k];
  }
  return out;
}

/**
 * После `remapCounterpartyLegalFormDottedKeys` в плоской карте не должно оставаться `counterparties.legalForm.<x>`:
 * иначе `flatOverridesToNested` строит объект `legalForm: { x: … }` и ломает ветку **`counterparties`**
 * (строка **`legalFormField`**, ключи **`legalForm_*`**, **`vatPayerCheckbox`** и т.д.) — на экране сырые ключи.
 */
export function dropCounterpartyLegalFormPoisonDottedKeys(
  flat: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(flat).filter(([k]) => !/^counterparties\.legalForm\.[^.]+$/.test(k)),
  );
}

/**
 * Полный пайплайн плоских оверрайдов перед `addResourceBundle` (как на клиенте, так в аудите БД).
 */
export function processTranslationOverridesFlat(flatRaw: Record<string, string>): Record<string, string> {
  return dropFlatRootStringNamespaceKeys(
    dropFlatKeysThatShadowNestedObjects(
      dropIdentityValueOverrides(
        dropFlatKeysShadowedByLongerKeys(
          dropCounterpartyLegalFormPoisonDottedKeys(
            remapCounterpartyLegalFormDottedKeys(normalizeTranslationOverrideFlat(flatRaw)),
          ),
        ),
      ),
    ),
  );
}

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
 * В `resources.ts` у namespace `translation` почти все ключи вложенные (`nav.home`, …).
 * Единственные односегментные строки на верхнем уровне — appTitle, language, az, ru.
 * Любой другой односегментный ключ из БД (`nav`, `dashboard`, …) при merge превращается
 * в строку и затирает целый объект из бандла → на экране снова сырой ключ `nav.sectionPurchases`.
 * Важно: проверять число **сегментов** после `split`, а не `key.includes('.')` — иначе `nav.` проходит фильтр.
 */
const ALLOWED_SINGLE_SEGMENT_OVERRIDE_KEYS = new Set([
  "appTitle",
  "language",
  "az",
  "ru",
]);

/**
 * В БД иногда сохраняют родительский ключ как одну строку (например `banking.cash` = «Касса»).
 * При merge он затирает весь объект из `resources.ts` (`banking.cash.*`), и `t("banking.cash.pageTitle")`
 * начинает показывать сырой ключ. Такие «короткие» пути нужно игнорировать — корректные оверрайды
 * идут листьями: `banking.cash.pageTitle`, …
 */
const FLAT_OVERRIDE_KEYS_THAT_SHADOW_NESTED_OBJECTS = new Set([
  "banking.cash",
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
      const parts = k.split(".").filter(Boolean);
      if (parts.length >= 2) return true;
      if (parts.length === 1) {
        return ALLOWED_SINGLE_SEGMENT_OVERRIDE_KEYS.has(parts[0]!);
      }
      return false;
    }),
  );
}

/**
 * Если в БД значение равно самому ключу (`auth.registerOrgLink` -> `auth.registerOrgLink`),
 * это не перевод, а «сырой» placeholder. Такие записи игнорируем, чтобы не затирать bundle.
 */
export function dropIdentityValueOverrides(
  flat: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(flat).filter(([k, v]) => {
      const key = k.trim();
      const value = String(v ?? "").trim();
      return value.length > 0 && value !== key;
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

/**
 * Подмешивает оверрайды из API. Язык — **только** `i18n.language` (тот же, что детектор / `changeLanguage`
 * в `client-i18n.ts`); не использовать `resolvedLanguage`, чтобы запрос БД и `addResourceBundle` всегда
 * совпадали с тем, что пользователь выбрал в UI.
 */
export async function applyTranslationOverrides(
  i18n: I18nType,
  signal?: AbortSignal,
): Promise<void> {
  const loc = uiLangRuAz(i18n.language);
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
  let res: Response;
  try {
    res = await fetch(
      `${base}/api/public/translations?locale=${encodeURIComponent(loc)}`,
      { credentials: "include", signal },
    );
  } catch (e) {
    if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) {
      return;
    }
    throw e;
  }
  if (!res.ok) return;
  let data: { overrides?: Record<string, string> } | null;
  try {
    data = (await safeJson(res)) as { overrides?: Record<string, string> } | null;
  } catch (e) {
    if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) {
      return;
    }
    throw e;
  }
  if (!data) return;
  const flat = processTranslationOverridesFlat(data.overrides ?? {});
  if (Object.keys(flat).length === 0) return;
  const nested = flatOverridesToNested(flat);
  /**
   * `loc` зафиксирован в начале функции от `i18n.language`, поэтому после await ответ кладётся
   * в тот же язык, для которого был запрос (а не в «текущий resolved» после гонки).
   *
   * `overwrite: true` — иначе при `deep: true` i18next **не заменяет** уже существующие в
   * `resources.ts` строки, и правки из БД / новые значения по тем же путям «не видны».
   */
  await i18n.addResourceBundle(loc, "translation", nested, true, true);
}
