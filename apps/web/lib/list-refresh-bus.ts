/** Lightweight cross-page list invalidation (no SWR/React Query in this app). */

export const LIST_REFRESH_EVENT = "dayday:list-refresh";

export type ListRefreshKey =
  | "counterparties"
  | "invoices"
  | "inventory-audits"
  | "inventory-hub"
  | "inventory-movements"
  | "inventory-transfers"
  | "inventory-adjustments";

/** После складских мутаций обновить реестры остатков / движений / köçürmə / düzəliş. */
export function notifyInventoryListsRefresh(): void {
  const keys: ListRefreshKey[] = [
    "inventory-hub",
    "inventory-movements",
    "inventory-transfers",
    "inventory-adjustments",
  ];
  for (const k of keys) {
    notifyListRefresh(k);
  }
}

export function notifyListRefresh(key: ListRefreshKey): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIST_REFRESH_EVENT, { detail: key }));
}

export function subscribeListRefresh(
  key: ListRefreshKey,
  fn: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const ce = e as CustomEvent<ListRefreshKey>;
    if (ce.detail === key) fn();
  };
  window.addEventListener(LIST_REFRESH_EVENT, handler as EventListener);
  return () =>
    window.removeEventListener(LIST_REFRESH_EVENT, handler as EventListener);
}
