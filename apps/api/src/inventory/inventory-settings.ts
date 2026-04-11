export type OrgInventorySettings = {
  allowNegativeStock?: boolean;
  defaultWarehouseId?: string | null;
};

export function parseInventorySettings(settingsJson: unknown): OrgInventorySettings {
  if (!settingsJson || typeof settingsJson !== "object") {
    return {};
  }
  const root = settingsJson as Record<string, unknown>;
  const inv = root.inventory;
  if (!inv || typeof inv !== "object") {
    return {};
  }
  const o = inv as Record<string, unknown>;
  return {
    allowNegativeStock:
      typeof o.allowNegativeStock === "boolean"
        ? o.allowNegativeStock
        : undefined,
    defaultWarehouseId:
      typeof o.defaultWarehouseId === "string" ? o.defaultWarehouseId : undefined,
  };
}

export function mergeInventorySettings(
  settingsJson: unknown,
  patch: OrgInventorySettings,
): Record<string, unknown> {
  const base =
    settingsJson && typeof settingsJson === "object"
      ? { ...(settingsJson as Record<string, unknown>) }
      : {};
  const prevInv =
    base.inventory && typeof base.inventory === "object"
      ? { ...(base.inventory as Record<string, unknown>) }
      : {};
  if (patch.allowNegativeStock !== undefined) {
    prevInv.allowNegativeStock = patch.allowNegativeStock;
  }
  if (patch.defaultWarehouseId !== undefined) {
    prevInv.defaultWarehouseId = patch.defaultWarehouseId;
  }
  base.inventory = prevInv;
  return base;
}
