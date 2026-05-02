"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyInventoryListsRefresh } from "../../../lib/list-refresh-bus";
import {
  MODAL_CHECKBOX_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_INPUT_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
} from "../../../lib/design-system";
import { uuidV4 } from "../../../lib/uuid";
import { AsyncCombobox } from "../../ui/async-combobox";
import { Button } from "../../ui/button";
import { NumericAmountInput } from "../../ui/numeric-amount-input";
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
  return hasError
    ? `${MODAL_INPUT_CLASS} border-red-500 ring-2 ring-red-500/25`
    : MODAL_INPUT_CLASS;
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
  const [bins, setBins] = useState<Bin[]>([]);
  const [productLabels, setProductLabels] = useState<Record<string, string>>({});
  const [warehouseId, setWarehouseId] = useState("");
  const [kind, setKind] = useState<PurchaseKind>("goods");
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false);
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const loadRefs = useCallback(async (purchaseKind: PurchaseKind) => {
    const isGoods = purchaseKind === "goods";
    if (!isGoods) {
      return { whList: [] as Warehouse[], bins: [] as Bin[], defaultWh: "" };
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
    return { whList, bins: binList, defaultWh };
  }, []);

  const fetchProducts = useCallback(
    async (search: string) => {
      const isGoods = kind === "goods";
      const q = new URLSearchParams();
      q.set("isService", isGoods ? "false" : "true");
      q.set("limit", "20");
      const trimmed = search.trim();
      if (trimmed) q.set("search", trimmed);
      const res = await apiFetch(`/api/products?${q}`);
      if (!res.ok) return [];
      const list = (await res.json()) as Product[];
      return Array.isArray(list) ? list : [];
    },
    [kind],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { whList, bins: binRows, defaultWh } = await loadRefs(kind);
      if (cancelled) return;
      setWarehouses(whList);
      setBins(binRows);
      setWarehouseId(kind === "goods" ? defaultWh : "");
      setLines([newLine()]);
      setProductLabels({});
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
          <div className="flex flex-wrap gap-4 text-[13px] text-[#34495E]">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="purchase-kind"
                checked={kind === "goods"}
                onChange={() => setKind("goods")}
                className="h-4 w-4 shrink-0 accent-[#2980B9]"
              />
              {t("inventory.purchaseKindGoods")}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="purchase-kind"
                checked={kind === "services"}
                onChange={() => setKind("services")}
                className="h-4 w-4 shrink-0 accent-[#2980B9]"
              />
              {t("inventory.purchaseKindServices")}
            </label>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#34495E]">
          <input
            type="checkbox"
            checked={pricesIncludeVat}
            onChange={(e) => setPricesIncludeVat(e.target.checked)}
            className={`mt-0.5 ${MODAL_CHECKBOX_CLASS}`}
          />
          <span>{t("inventory.purchasePricesIncludeVat")}</span>
        </label>

        {isGoods ? (
          <label className={MODAL_FIELD_LABEL_CLASS}>
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
              className={`mt-1 block w-full ${fieldErrorClass(!!err("warehouseId"))}`}
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

        <div className="overflow-x-auto rounded-[2px] border border-[#D5DADF] bg-white shadow-sm">
          <table className="min-w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-[1] border-b border-[#D5DADF] bg-[#F8FAFC] text-left text-[#34495E]">
              <tr>
                <th className="px-4 py-2 text-xs font-bold text-[#475569]">{t("inventory.purchaseColProduct")}</th>
                <th className="w-28 px-4 py-2 text-xs font-bold text-[#475569]">{t("inventory.purchaseColQty")}</th>
                <th className="w-32 px-4 py-2 text-xs font-bold text-[#475569]">{t("inventory.purchaseColPrice")}</th>
                {isGoods ? (
                  <th className="min-w-[8rem] px-4 py-2 text-xs font-bold text-[#475569]">
                    {t("inventory.purchaseColBin")}
                  </th>
                ) : null}
                <th className="w-12 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((row, idx) => (
                <tr key={row.key} className="border-b border-[#D5DADF] bg-white transition-colors hover:bg-[#F1F5F9]">
                  <td className="px-4 py-2 align-middle">
                    <AsyncCombobox<Product>
                      value={row.productId}
                      onChange={(id, item) => {
                        updateLine(idx, { productId: id });
                        setProductLabels((prev) => ({
                          ...prev,
                          [row.key]: item ? (item.isService ? item.name : `${item.name} (${item.sku})`) : "",
                        }));
                      }}
                      fetcher={fetchProducts}
                      getOptionLabel={(p) => (p.isService ? p.name : `${p.name} (${p.sku})`)}
                      placeholder={t("common.emptyValue")}
                      selectedLabel={productLabels[row.key] ?? ""}
                      className="min-w-0"
                      listClassName="min-w-[14rem]"
                      aria-invalid={!!err(`lines.${idx}.productId`)}
                    />
                    {err(`lines.${idx}.productId`) ? (
                      <p className="mt-1 text-xs text-red-600 m-0">{err(`lines.${idx}.productId`)}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <NumericAmountInput
                      value={row.quantity}
                      onValueChange={(plain) => updateLine(idx, { quantity: plain })}
                      decimalScale={4}
                      className={
                        err(`lines.${idx}.quantity`) ? "border-red-500 ring-2 ring-red-500/25" : ""
                      }
                      aria-invalid={!!err(`lines.${idx}.quantity`)}
                    />
                    {err(`lines.${idx}.quantity`) ? (
                      <p className="mt-1 text-xs text-red-600 m-0">{err(`lines.${idx}.quantity`)}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <NumericAmountInput
                      value={row.unitPrice}
                      onValueChange={(plain) => updateLine(idx, { unitPrice: plain })}
                      decimalScale={4}
                      className={
                        err(`lines.${idx}.unitPrice`) ? "border-red-500 ring-2 ring-red-500/25" : ""
                      }
                      aria-invalid={!!err(`lines.${idx}.unitPrice`)}
                    />
                    {err(`lines.${idx}.unitPrice`) ? (
                      <p className="mt-1 text-xs text-red-600 m-0">{err(`lines.${idx}.unitPrice`)}</p>
                    ) : null}
                  </td>
                  {isGoods ? (
                    <td className="px-4 py-2 align-middle">
                      <select
                        value={row.binId}
                        onChange={(e) => updateLine(idx, { binId: e.target.value })}
                        className={MODAL_INPUT_CLASS}
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
                  <td className="px-4 py-2 align-middle text-center">
                    <button
                      type="button"
                      className={`${TABLE_ROW_ICON_BTN_CLASS} text-[#E74C3C]`}
                      title={t("inventory.purchaseRemoveLine")}
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
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, newLine()])}>
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {t("inventory.purchaseAddLine")}
        </Button>
      </form>
    </InventoryModalShell>
  );
}
