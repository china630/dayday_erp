"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyInventoryListsRefresh } from "../../../lib/list-refresh-bus";
import { inputFieldWideClass } from "../../../lib/form-classes";
import { BORDER_MUTED_CLASS, SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";
import { uuidV4 } from "../../../lib/uuid";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";
import {
  buildPurchasePayload,
  validatePurchaseForm,
  type PurchaseFormValues,
  type PurchaseLineFormValue,
  type PurchaseKind,
} from "./purchase-validation";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string; vatRate?: unknown; isService?: boolean };
type Bin = { id: string; warehouseId: string; code: string; barcode?: string | null };

type LineRow = PurchaseLineFormValue & { key: string };

const FORM_ID = "inventory-modal-purchase-form";

function newLine(): LineRow {
  return { key: uuidV4(), productId: "", quantity: "", unitPrice: "", binId: "" };
}

function fieldErrorClass(hasError: boolean) {
  return hasError ? `${inputFieldWideClass} border-red-500 ring-2 ring-red-500/25` : inputFieldWideClass;
}

export function PurchaseModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [kind, setKind] = useState<PurchaseKind>("goods");
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false);
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const loadRefs = useCallback(async (purchaseKind: PurchaseKind) => {
    const isGoods = purchaseKind === "goods";
    const productQuery = isGoods ? "isService=false" : "isService=true";
    const p = await apiFetch(`/api/products?${productQuery}`);
    const plist = p.ok ? ((await p.json()) as Product[]) : [];
    if (!isGoods) {
      return { whList: [] as Warehouse[], plist, bins: [] as Bin[], defaultWh: "" };
    }
    const [w, cfg, b] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/inventory/settings"),
      apiFetch("/api/inventory/bins"),
    ]);
    const whList = w.ok ? ((await w.json()) as Warehouse[]) : [];
    const binList = b.ok ? ((await b.json()) as Bin[]) : [];
    let defaultWh = "";
    if (cfg.ok) {
      const j = (await cfg.json()) as {
        defaultWarehouseResolvedId?: string | null;
        defaultWarehouseId?: string | null;
      };
      defaultWh = (j.defaultWarehouseId ?? j.defaultWarehouseResolvedId ?? "") || "";
    }
    if (!defaultWh && whList[0]) defaultWh = whList[0].id;
    return { whList, plist, bins: binList, defaultWh };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { whList, plist, bins, defaultWh } = await loadRefs(kind);
      if (cancelled) return;
      setWarehouses(whList);
      setProducts(plist);
      setBins(bins);
      setWarehouseId(kind === "goods" ? defaultWh : "");
      setLines([newLine()]);
      setFieldErrors({});
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, loadRefs]);

  useEffect(() => {
    if (!open) return;
    setPricesIncludeVat(false);
  }, [open, kind]);

  function err(path: string): string | undefined {
    return fieldErrors[path];
  }

  function updateLine(i: number, patch: Partial<PurchaseLineFormValue>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`lines.${i}.`)) delete next[k];
      }
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    const formValues: PurchaseFormValues = {
      kind,
      warehouseId,
      pricesIncludeVat,
      lines: lines.map(({ productId, quantity, unitPrice, binId }) => ({
        productId,
        quantity,
        unitPrice,
        binId,
      })),
    };
    const validated = validatePurchaseForm(t, formValues);
    if (!validated.ok) {
      setFieldErrors(validated.fieldErrors);
      return;
    }

    const body = buildPurchasePayload(validated.values);
    setBusy(true);
    const res = await apiFetch("/api/inventory/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    notifyInventoryListsRefresh();
    onSaved?.();
    onClose();
  }

  const isGoods = kind === "goods";

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.purchaseModalTitle")}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      footer={<InventoryModalFooter onCancel={onClose} busy={busy} formId={FORM_ID} />}
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <p className="mb-2 text-[13px] font-medium text-[#34495E]">{t("inventory.purchaseKindLabel")}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="purchase-kind"
                checked={kind === "goods"}
                onChange={() => setKind("goods")}
                className="text-action"
              />
              {t("inventory.purchaseKindGoods")}
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="purchase-kind"
                checked={kind === "services"}
                onChange={() => setKind("services")}
                className="text-action"
              />
              {t("inventory.purchaseKindServices")}
            </label>
          </div>
        </div>

        <label className="flex items-start gap-2 text-[13px] text-[#34495E]">
          <input
            type="checkbox"
            checked={pricesIncludeVat}
            onChange={(e) => setPricesIncludeVat(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-action focus:ring-action"
          />
          <span>{t("inventory.purchasePricesIncludeVat")}</span>
        </label>

        {isGoods ? (
          <label className="block text-[13px] font-medium text-[#34495E]">
            {t("inventory.whSelect")}
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.warehouseId;
                  return next;
                });
              }}
              className={fieldErrorClass(!!err("warehouseId"))}
              aria-invalid={!!err("warehouseId")}
            >
              <option value="">{t("inventory.whSelect")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {err("warehouseId") ? <p className="mt-1 text-xs text-red-600 m-0">{err("warehouseId")}</p> : null}
          </label>
        ) : null}

        <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS}`}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F4F5F7] text-left text-[#34495E]">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("inventory.purchaseColProduct")}</th>
                <th className="w-28 px-3 py-2 font-semibold">{t("inventory.purchaseColQty")}</th>
                <th className="w-32 px-3 py-2 font-semibold">{t("inventory.purchaseColPrice")}</th>
                {isGoods ? (
                  <th className="min-w-[8rem] px-3 py-2 font-semibold">{t("inventory.purchaseColBin")}</th>
                ) : null}
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((row, idx) => (
                <tr key={row.key} className="border-t border-[#EBEDF0]">
                  <td className="px-3 py-2 align-middle">
                    <select
                      value={row.productId}
                      onChange={(e) => updateLine(idx, { productId: e.target.value })}
                      className={fieldErrorClass(!!err(`lines.${idx}.productId`))}
                      aria-invalid={!!err(`lines.${idx}.productId`)}
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.isService ? p.name : `${p.name} (${p.sku})`}
                        </option>
                      ))}
                    </select>
                    {err(`lines.${idx}.productId`) ? (
                      <p className="mt-1 text-xs text-red-600 m-0">{err(`lines.${idx}.productId`)}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={row.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                      className={fieldErrorClass(!!err(`lines.${idx}.quantity`))}
                      aria-invalid={!!err(`lines.${idx}.quantity`)}
                      inputMode="decimal"
                    />
                    {err(`lines.${idx}.quantity`) ? (
                      <p className="mt-1 text-xs text-red-600 m-0">{err(`lines.${idx}.quantity`)}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={row.unitPrice}
                      onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                      className={fieldErrorClass(!!err(`lines.${idx}.unitPrice`))}
                      aria-invalid={!!err(`lines.${idx}.unitPrice`)}
                      inputMode="decimal"
                    />
                    {err(`lines.${idx}.unitPrice`) ? (
                      <p className="mt-1 text-xs text-red-600 m-0">{err(`lines.${idx}.unitPrice`)}</p>
                    ) : null}
                  </td>
                  {isGoods ? (
                    <td className="px-3 py-2 align-middle">
                      <select
                        value={row.binId}
                        onChange={(e) => updateLine(idx, { binId: e.target.value })}
                        className={inputFieldWideClass}
                      >
                        <option value="">{t("inventory.purchaseBinAuto")}</option>
                        {bins
                          .filter((b) => !warehouseId || b.warehouseId === warehouseId)
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code}
                            </option>
                          ))}
                      </select>
                    </td>
                  ) : null}
                  <td className="px-3 py-2 align-middle text-center">
                    <button
                      type="button"
                      title={t("inventory.purchaseRemoveLine")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#D5DADF] text-slate-600 hover:bg-[#F4F5F7]"
                      onClick={() => {
                        if (lines.length <= 1) return;
                        setLines((prev) => prev.filter((_, j) => j !== idx));
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          for (const k of Object.keys(next)) {
                            if (k.startsWith(`lines.${idx}.`)) delete next[k];
                          }
                          return next;
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setLines((prev) => [...prev, newLine()])}>
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {t("inventory.purchaseAddLine")}
        </button>
      </form>
    </InventoryModalShell>
  );
}
