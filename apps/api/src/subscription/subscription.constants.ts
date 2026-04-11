/**
 * Ключи для @RequiresModule — см. SubscriptionAccessService.
 * Slugs в activeModules / customConfig.modules: production, manufacturing, fixed_assets, ifrs, banking_pro, hr_full, kassa (и др.).
 */
export const REQUIRES_MODULE_KEY = "subscription:requiresModule" as const;

/**
 * Модули, записываемые в `OrganizationSubscription.activeModules` и `Organization.activeModules`
 * при создании организации (без внешних скриптов).
 * - `nas` — национальный план счетов (ядро книги NAS);
 * - `ifrs` / `ifrs_mapping` — Multi-GAAP / маппинг (согласовано с биллингом и `computeEntitlements`).
 */
export const DEFAULT_NEW_ORGANIZATION_ACTIVE_MODULES: string[] = [
  "nas",
  "ifrs",
  "ifrs_mapping",
];

export const ModuleEntitlement = {
  MANUFACTURING: "manufacturing",
  FIXED_ASSETS: "fixed_assets",
  /** NAS ↔ IFRS mapping — ENTERPRISE или модуль ifrs */
  IFRS_MAPPING: "ifrs_mapping",
  /** Direct Banking API, реестр — slug `banking_pro` */
  BANKING_PRO: "banking_pro",
  /** Касса PKO/RKO, журнал, авансы — v8.2 (конструктор; ENTERPRISE — полный доступ) */
  KASSA_PRO: "kassa_pro",
  /** Расширенный HR (полный пакет) — v8.1 конструктор */
  HR_FULL: "hr_full",
} as const;

export type ModuleEntitlementKey =
  (typeof ModuleEntitlement)[keyof typeof ModuleEntitlement];
