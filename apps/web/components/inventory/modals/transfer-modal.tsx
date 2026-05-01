"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyInventoryListsRefresh } from "../../../lib/list-refresh-bus";
import { INPUT_BORDERED_CLASS, SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string };
type Line = { productId: string; quantity: string };

const FORM_ID = "inventory-modal-transfer-form";

export function TransferModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1" }]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [w, p] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/products?isService=false"),
    ]);
    if (w.ok) {
      const list = (await w.json()) as Warehouse[];
      setWarehouses(list);
      setFromId((prev) => prev || list[0]?.id || "");
      setToId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
        return list[1]?.id ?? list[0]?.id ?? "";
      });
    }
    if (p.ok) {
      const plist = (await p.json()) as Product[];
      setProducts(plist);
      setLines((prev) =>
        prev.length && prev[0].productId
          ? prev
          : [{ productId: plist[0]?.id ?? "", quantity: "1" }],
      );
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    setBusy(false);
  }, [open, load]);

  function addLine() {
    setLines((prev) => [...prev, { productId: products[0]?.id ?? "", quantity: "1" }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromId || !toId) {
      toast.error(t("inventory.transferNeedWh"));
      return;
    }
    if (fromId === toId) {
      toast.error(t("inventory.transferSameWh"));
      return;
    }
    const ops: { productId: string; quantity: number }[] = [];
    for (const row of lines) {
      const q = Number(row.quantity);
      if (!row.productId || !Number.isFinite(q) || q <= 0) continue;
      ops.push({ productId: row.productId, quantity: q });
    }
    if (ops.length === 0) {
      toast.error(t("inventory.transferNeedLines"));
      return;
    }
    setBusy(true);
    try {
      for (const op of ops) {
        const res = await apiFetch("/api/inventory/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromWarehouseId: fromId,
            toWarehouseId: toId,
            productId: op.productId,
            quantity: op.quantity,
          }),
        });
        if (!res.ok) {
          toast.error(t("common.saveErr"), { description: await res.text() });
          setBusy(false);
          return;
        }
      }
      toast.success(t("common.save"));
      notifyInventoryListsRefresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.transferTitle")}
      subtitle={t("inventory.transferHint")}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={<InventoryModalFooter onCancel={onClose} busy={busy} formId={FORM_ID} />}
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[13px] font-medium text-[#34495E]">
            {t("inventory.transferFrom")}
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
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
            {t("inventory.transferTo")}
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[#34495E]">{t("inventory.transferLines")}</span>
            <button type="button" onClick={() => addLine()} className={SECONDARY_BUTTON_CLASS}>
              + {t("inventory.transferAddLine")}
            </button>
          </div>
          {lines.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[200px] flex-1 text-[13px] font-medium text-[#34495E]">
                {t("inventory.thProduct")}
                <select
                  value={row.productId}
                  onChange={(e) => updateLine(i, { productId: e.target.value })}
                  className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
                >
                  <option value="">{t("inventory.transferPickProduct")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block w-32 text-[13px] font-medium text-[#34495E]">
                {t("inventory.thQty")}
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
                />
              </label>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className={`mb-1 ${SECONDARY_BUTTON_CLASS} min-w-8 px-2`}
                  aria-label="Remove row"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </form>
    </InventoryModalShell>
  );
}
