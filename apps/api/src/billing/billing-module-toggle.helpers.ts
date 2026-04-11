import { BadRequestException } from "@nestjs/common";

export const TOGGLE_MODULE_META_PURPOSE = "toggle_module" as const;

export type ToggleModuleMetadata = {
  purpose: typeof TOGGLE_MODULE_META_PURPOSE;
  moduleKey: string;
  enabled: boolean;
};

export function parseToggleModuleMetadata(
  raw: unknown,
): ToggleModuleMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.purpose !== TOGGLE_MODULE_META_PURPOSE) return null;
  if (typeof o.moduleKey !== "string" || !o.moduleKey) return null;
  if (typeof o.enabled !== "boolean") return null;
  return {
    purpose: TOGGLE_MODULE_META_PURPOSE,
    moduleKey: o.moduleKey,
    enabled: o.enabled,
  };
}

/**
 * PATCH для `SubscriptionAccessService.updateModuleAddons` по ключу из `pricing_modules`.
 */
export function catalogModuleKeyToPatch(
  moduleKey: string,
  enabled: boolean,
): {
  production?: boolean;
  ifrs?: boolean;
  kassa_pro?: boolean;
  banking_pro?: boolean;
  inventory?: boolean;
  manufacturing?: boolean;
  hr_full?: boolean;
  ifrs_mapping?: boolean;
} {
  switch (moduleKey) {
    case "kassa_pro":
      return { kassa_pro: enabled };
    case "banking_pro":
      return { banking_pro: enabled };
    case "inventory":
      return { inventory: enabled };
    case "manufacturing":
      return { manufacturing: enabled, production: enabled };
    case "hr_full":
      return { hr_full: enabled };
    case "ifrs_mapping":
      return { ifrs_mapping: enabled, ifrs: enabled };
    default:
      throw new BadRequestException({
        code: "UNKNOWN_MODULE",
        message: "Unknown module key",
      });
  }
}

export function isCatalogModuleActive(
  activeModules: string[],
  moduleKey: string,
): boolean {
  const set = new Set(activeModules);
  switch (moduleKey) {
    case "manufacturing":
      return set.has("manufacturing") || set.has("production");
    case "ifrs_mapping":
      return set.has("ifrs_mapping") || set.has("ifrs");
    default:
      return set.has(moduleKey);
  }
}

/** Доля месяца от текущего UTC-дня до конца месяца включительно (для Pro-rata). */
export function proRataFractionUtc(now = new Date()): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = now.getUTCDate();
  const daysLeftIncludingToday = daysInMonth - day + 1;
  return daysLeftIncludingToday / daysInMonth;
}

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function hasConstructorModulesInCustomConfig(
  customConfig: unknown,
): boolean {
  if (customConfig == null || typeof customConfig !== "object") return false;
  const m = (customConfig as { modules?: unknown }).modules;
  return Array.isArray(m) && m.length > 0;
}
