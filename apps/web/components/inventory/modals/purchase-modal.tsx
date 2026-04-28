"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyListRefresh } from "../../../lib/list-refresh-bus";
import { inputFieldWideClass } from "../../../lib/form-classes";
import { BORDER_MUTED_CLASS, SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";
import { uuidV4 } from "../../../lib/uuid";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string };
type Bin = { id: string; warehouseId: string; code: string; barcode?: string | null };

type LineRow = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  binId: string;
};

function newLine(): LineRow {
  return {
    key: uuidV4(),
    productId: "",
    quantity: "",
    unitPrice: "",
    binId: "",
  };
}

const FORM_ID = "inventory-modal-purchase-form";

export function PurchaseModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [purWh, setPurWh] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);
  const [busy, setBusy] = useState(false);

  const loadWh = useCallback(async () => {
    const [w, p, cfg, b] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/products"),
      apiFetch("/api/inventory/settings"),
      apiFetch("/api/inventory/bins"),
    ]);
    if (w.ok) {
      const list = (await w.json()) as Warehouse[];
      setWarehouses(list);
      setPurWh((prev) => prev || list[0]?.id || "");
    }
    if (p.ok) {
      setProducts((await p.json()) as Product[]);
    }
    if (cfg.ok) {
      const j = (await cfg.json()) as {
        defaultWarehouseResolvedId?: string | null;
        defaultWarehouseId?: string | null;
      };
      const def = j.defaultWarehouseId ?? j.defaultWarehouseResolvedId ?? null;
      if (def) setPurWh((prev) => prev || def);
    }
    if (b.ok) {
      setBins((await b.json()) as Bin[]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadWh();
    setLines([newLine()]);
    setBusy(false);
  }, [open, loadWh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed: { productId: string; quantity: number; unitPrice: number; binId?: string }[] = [];
    for (const row of lines) {
      if (!row.productId.trim()) continue;
      const q = Number(String(row.quantity).replace(",", "."));
      const u = Number(String(row.unitPrice).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) {
        continue;
      }
      parsed.push({
        productId: row.productId.trim(),
        quantity: q,
        unitPrice: u,
        binId: row.binId.trim() || undefined,
      });
    }
    if (!purWh || parsed.length === 0) {
      toast.error(t("inventory.alertPurchase"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/inventory/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseId: purWh,
        lines: parsed,
        reference: "WEB",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    notifyListRefresh("inventory-hub");
    onClose();
  }

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.purchasePageTitle")}
      subtitle={t("inventory.purchaseHint")}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      footer={<InventoryModalFooter onCancel={onClose} busy={busy} formId={FORM_ID} />}
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-[13px] font-medium text-[#34495E]">
          {t("inventory.whSelect")}
          <select
            value={purWh}
            onChange={(e) => setPurWh(e.target.value)}
            className={`mt-1 ${inputFieldWideClass}`}
          >
            <option value="">{t("inventory.whSelect")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS}`}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F4F5F7] text-left text-[#34495E]">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("inventory.purchaseColProduct")}</th>
                <th className="w-28 px-3 py-2 font-semibold">{t("inventory.purchaseColQty")}</th>
                <th className="w-32 px-3 py-2 font-semibold">{t("inventory.purchaseColPrice")}</th>
                <th className="px-3 py-2 font-semibold">{t("inventory.purchaseColBin")}</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((row, idx) => (
                <tr key={row.key} className="border-t border-[#EBEDF0]">
                  <td className="px-3 py-2 align-middle">
                    <select
                      value={row.productId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, productId: v } : x)),
                        );
                      }}
                      className={inputFieldWideClass}
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <select
                      value={row.binId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, binId: v } : x)),
                        );
                      }}
                      className={inputFieldWideClass}
                    >
                      <option value="">{t("inventory.purchaseBinAuto")}</option>
                      {bins
                        .filter((b) => !purWh || b.warehouseId === purWh)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={row.quantity}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, quantity: v } : x)),
                        );
                      }}
                      className={inputFieldWideClass}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={row.unitPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, unitPrice: v } : x)),
                        );
                      }}
                      className={inputFieldWideClass}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle text-center">
                    <button
                      type="button"
                      title={t("inventory.purchaseRemoveLine")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#D5DADF] text-slate-600 hover:bg-[#F4F5F7]"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS}
          onClick={() => setLines((prev) => [...prev, newLine()])}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {t("inventory.purchaseAddLine")}
        </button>
      </form>
    </InventoryModalShell>
  );
}
