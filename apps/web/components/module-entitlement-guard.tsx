"use client";

/**
 * Обёртка по модулю подписки: дети рендерятся только при доступе к модулю.
 * Иначе — paywall (тариф Enterprise разблокирует модули в snapshot и на API).
 */
export { SubscriptionPaywall as ModuleEntitlementGuard } from "./subscription-paywall";
export type { PaywallModule as ModuleEntitlementKey } from "./subscription-paywall";
