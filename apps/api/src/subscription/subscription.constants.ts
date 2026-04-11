/**
 * Ключи для @RequiresModule — см. SubscriptionAccessService.
 * Slugs в activeModules / customConfig.modules: production, manufacturing, fixed_assets, ifrs, banking_pro, hr_full, kassa (и др.).
 */
export const REQUIRES_MODULE_KEY = "subscription:requiresModule" as const;

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
