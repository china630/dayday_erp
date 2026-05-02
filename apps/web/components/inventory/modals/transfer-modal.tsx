"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyInventoryListsRefresh } from "../../../lib/list-refresh-bus";
import {
  MODAL_FIELD_LABEL_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_INPUT_NUMERIC_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
} from "../../../lib/design-system";
import { Button } from "../../ui/button";
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
          <label className={MODAL_FIELD_LABEL_CLASS}>
            {t("inventory.transferFrom")}
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className={MODAL_FIELD_LABEL_CLASS}>
            {t("inventory.transferTo")}
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[#34495E]">{t("inventory.transferLines")}</span>
            <Button type="button" variant="secondary" onClick={() => addLine()}>
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              {t("inventory.transferAddLine")}
            </Button>
          </div>
          {lines.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className={`${MODAL_FIELD_LABEL_CLASS} min-w-[200px] flex-1`}>
                {t("inventory.thProduct")}
                <select
                  value={row.productId}
                  onChange={(e) => updateLine(i, { productId: e.target.value })}
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                >
                  <option value="">{t("inventory.transferPickProduct")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${MODAL_FIELD_LABEL_CLASS} w-32`}>
                {t("inventory.thQty")}
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                />
              </label>
              {lines.length > 1 ? (
                <button
                  type="button"
                  className={`${TABLE_ROW_ICON_BTN_CLASS} mb-1 text-[#E74C3C]`}
                  onClick={() => removeLine(i)}
                  title={t("inventory.purchaseRemoveLine")}
                  aria-label={t("inventory.purchaseRemoveLine")}
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </form>
    </InventoryModalShell>
  );
}
