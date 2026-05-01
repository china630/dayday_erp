import type { TFunction } from "i18next";

export type PurchaseKind = "goods" | "services";

export type PurchaseLineFormValue = {
  productId: string;
  quantity: string;
  unitPrice: string;
  binId: string;
};

export type PurchaseFormValues = {
  kind: PurchaseKind;
  warehouseId: string;
  pricesIncludeVat: boolean;
  lines: PurchaseLineFormValue[];
};

export function numFromFormField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "")
    .trim()
    .replace(",", ".");
  if (s === "") return NaN;
  return Number(s);
}

function isRowEmpty(line: PurchaseLineFormValue): boolean {
  return (
    !line.productId?.trim() &&
    !String(line.quantity ?? "").trim() &&
    !String(line.unitPrice ?? "").trim() &&
    !line.binId?.trim()
  );
}

/** Валидация без внешних зависимостей: только понятные сообщения и пути полей. */
export function validatePurchaseForm(
  t: TFunction,
  data: PurchaseFormValues,
): { ok: true; values: PurchaseFormValues } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const kind = data.kind ?? "goods";

  if (kind === "goods" && !data.warehouseId?.trim()) {
    fieldErrors.warehouseId = t("inventory.purchaseValidationWarehouse");
  }

  const meaningful = data.lines.filter((l) => !isRowEmpty(l));
  if (meaningful.length === 0) {
    fieldErrors["lines.0.productId"] = t("inventory.purchaseValidationMinLines");
    return { ok: false, fieldErrors };
  }

  data.lines.forEach((line, i) => {
    if (isRowEmpty(line)) return;
    const lineNo = i + 1;
    const hasProduct = !!line.productId?.trim();
    const q = numFromFormField(line.quantity);
    const u = numFromFormField(line.unitPrice);

    if (!hasProduct) {
      fieldErrors[`lines.${i}.productId`] = t("inventory.purchaseValidationLineProduct", { line: lineNo });
    }
    if (!Number.isFinite(q) || q <= 0) {
      fieldErrors[`lines.${i}.quantity`] = t("inventory.purchaseValidationLineQty", { line: lineNo });
    }
    if (!Number.isFinite(u) || u < 0) {
      fieldErrors[`lines.${i}.unitPrice`] = t("inventory.purchaseValidationLinePrice", { line: lineNo });
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, values: data };
}

export function buildPurchasePayload(values: PurchaseFormValues): {
  kind: PurchaseKind;
  warehouseId?: string;
  pricesIncludeVat: boolean;
  lines: { productId: string; quantity: number; unitPrice: number; binId?: string }[];
  reference: string;
} {
  const kind = values.kind ?? "goods";
  const lines = values.lines
    .filter(
      (l) =>
        l.productId?.trim() &&
        String(l.quantity ?? "").trim() &&
        String(l.unitPrice ?? "").trim(),
    )
    .map((l) => ({
      productId: l.productId.trim(),
      quantity: numFromFormField(l.quantity),
      unitPrice: numFromFormField(l.unitPrice),
      ...(kind === "goods" && l.binId?.trim() ? { binId: l.binId.trim() } : {}),
    }));
  return {
    kind,
    pricesIncludeVat: values.pricesIncludeVat,
    ...(kind === "goods" ? { warehouseId: values.warehouseId.trim() } : {}),
    lines,
    reference: "WEB",
  };
}
