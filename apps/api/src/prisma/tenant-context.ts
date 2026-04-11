import { AsyncLocalStorage } from "node:async_hooks";

export type TenantContextStore = {
  /** Текущая организация из JWT. */
  organizationId: string | null;
  /** Пропуск фильтра по тенанту (супер-админ /api/admin, публичные маршруты, глобальные воркеры). */
  skipTenantFilter: boolean;
};

export const tenantContextStorage = new AsyncLocalStorage<TenantContextStore>();

export function getTenantContext(): TenantContextStore | undefined {
  return tenantContextStorage.getStore();
}

export function runWithTenantContext<T>(
  store: TenantContextStore,
  fn: () => T,
): T {
  return tenantContextStorage.run(store, fn);
}

export async function runWithTenantContextAsync<T>(
  store: TenantContextStore,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantContextStorage.run(store, fn);
}
