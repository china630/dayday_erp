"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyInventoryListsRefresh } from "../../../lib/list-refresh-bus";
import { INPUT_BORDERED_CLASS } from "../../../lib/design-system";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string };

const FORM_ID = "inventory-modal-adjustments-form";

export function AdjustmentsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"OUT" | "IN">("OUT");
  const [inventoryAccountCode, setInventoryAccountCode] = useState<"201" | "204">("201");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, p] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/products?isService=false"),
    ]);
    if (w.ok) {
      const list = (await w.json()) as Warehouse[];
      setWarehouses(list);
      setWarehouseId((prev) => prev || list[0]?.id || "");
    }
    if (p.ok) {
      const plist = (await p.json()) as Product[];
      setProducts(plist);
      setProductId((prev) => prev || plist[0]?.id || "");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    setBusy(false);
  }, [open, load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(quantity);
    if (!warehouseId || !productId || !Number.isFinite(q) || q <= 0) {
      toast.error(t("inventory.adjustNeedFields"));
      return;
    }
    if (type === "IN") {
      const up = Number(unitPrice);
      if (!Number.isFinite(up) || up < 0) {
        toast.error(t("inventory.adjustNeedUnitPrice"));
        return;
      }
    }
    const body: Record<string, unknown> = {
      warehouseId,
      productId,
      quantity: q,
      type,
      inventoryAccountCode,
    };
    if (type === "IN") {
      body.unitPrice = Number(unitPrice);
    }
    setBusy(true);
    const res = await apiFetch("/api/inventory/adjustments", {
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
    onClose();
  }

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.adjustTitle")}
      subtitle={t("inventory.adjustHint")}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={<InventoryModalFooter onCancel={onClose} busy={busy} formId={FORM_ID} />}
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.whSelect")}
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.thProduct")}
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-[#34495E]">{t("inventory.adjustType")}</legend>
          <label className="mr-6 inline-flex items-center gap-2">
            <input
              type="radio"
              name="adjType"
              checked={type === "OUT"}
              onChange={() => setType("OUT")}
            />
            {t("inventory.adjustOut")}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="adjType"
              checked={type === "IN"}
              onChange={() => setType("IN")}
            />
            {t("inventory.adjustIn")}
          </label>
        </fieldset>

        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.adjustInvAccount")}
          <select
            value={inventoryAccountCode}
            onChange={(e) => setInventoryAccountCode(e.target.value === "204" ? "204" : "201")}
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
          >
            <option value="201">{t("inventory.adjustInv201")}</option>
            <option value="204">{t("inventory.adjustInv204")}</option>
          </select>
        </label>

        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.thQty")}
          <input
            type="number"
            min={0.0001}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
          />
        </label>

        {type === "IN" && (
          <label className="block text-[13px] font-medium text-[#34495E]">
            {t("inventory.adjustUnitPrice")}
            <input
              type="number"
              min={0}
              step="any"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            />
          </label>
        )}
      </form>
    </InventoryModalShell>
  );
}
