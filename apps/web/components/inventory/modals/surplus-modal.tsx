"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { INPUT_BORDERED_CLASS } from "../../../lib/design-system";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string; isService?: boolean };

const FORM_ID = "inventory-modal-surplus-form";

export function SurplusModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [inventoryAccountCode, setInventoryAccountCode] = useState<"201" | "204">("201");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, p] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/products"),
    ]);
    if (w.ok) {
      const list = (await w.json()) as Warehouse[];
      setWarehouses(list);
      setWarehouseId((prev) => prev || list[0]?.id || "");
    }
    if (p.ok) {
      const plist = ((await p.json()) as Product[]).filter((x) => !x.isService);
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
    const up = Number(unitPrice);
    if (!warehouseId || !productId || !Number.isFinite(q) || q <= 0) {
      toast.error(t("inventory.adjustNeedFields"));
      return;
    }
    if (!Number.isFinite(up) || up < 0) {
      toast.error(t("inventory.adjustNeedUnitPrice"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/inventory/documents/surplus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseId,
        productId,
        quantity: q,
        inventoryAccountCode,
        unitPrice: up,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    onSuccess();
    onClose();
  }

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.surplusDocTitle")}
      subtitle={t("inventory.adjustHint")}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={<InventoryModalFooter onCancel={onClose} busy={busy} formId={FORM_ID} />}
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.transferFrom")}
          <select
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.transferPickProduct")}
          <select
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.adjustInvAccount")}
          <select
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            value={inventoryAccountCode}
            onChange={(e) => setInventoryAccountCode(e.target.value as "201" | "204")}
          >
            <option value="201">{t("inventory.adjustInv201")}</option>
            <option value="204">{t("inventory.adjustInv204")}</option>
          </select>
        </label>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("invoiceNew.quantity")}
          <input
            type="number"
            min={0.0001}
            step="any"
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </label>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.adjustUnitPrice")}
          <input
            type="number"
            min={0}
            step="0.01"
            className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
        </label>
      </form>
    </InventoryModalShell>
  );
}
