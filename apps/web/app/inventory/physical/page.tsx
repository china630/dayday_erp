"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  LINK_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string; isService?: boolean };
type StockRow = {
  quantity: unknown;
  product: Product;
};

type Line = { productId: string; actualQty: string };

const DOC_TYPES = ["INVENTORY_COUNT", "WRITE_OFF", "SURPLUS"] as const;

export default function InventoryPhysicalPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>("INVENTORY_COUNT");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", actualQty: "0" }]);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const productGoods = useMemo(
    () => products.filter((p) => !p.isService),
    [products],
  );

  const bookByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of stockRows) {
      m.set(r.product.id, Number(r.quantity));
    }
    return m;
  }, [stockRows]);

  const loadWarehousesProducts = useCallback(async () => {
    if (!token) return;
    const [w, p] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/products"),
    ]);
    if (w.ok) {
      const list = (await w.json()) as Warehouse[];
      setWarehouses(list);
      setWarehouseId((prev) => (prev && list.some((x) => x.id === prev) ? prev : list[0]?.id ?? ""));
    }
    if (p.ok) {
      setProducts((await p.json()) as Product[]);
    }
  }, [token]);

  const loadStock = useCallback(async () => {
    if (!token || !warehouseId) return;
    const res = await apiFetch(
      `/api/inventory/stock?warehouseId=${encodeURIComponent(warehouseId)}`,
    );
    if (res.ok) {
      const rows = (await res.json()) as StockRow[];
      setStockRows(rows);
    }
  }, [token, warehouseId]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadWarehousesProducts();
  }, [loadWarehousesProducts, ready, token]);

  useEffect(() => {
    if (!warehouseId) return;
    void loadStock();
  }, [loadStock, warehouseId]);

  function addLine() {
    const first = productGoods[0]?.id ?? "";
    setLines((prev) => [...prev, { productId: first, actualQty: "0" }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!token || !warehouseId) {
      alert(t("inventory.physicalNeedWh"));
      return;
    }
    const payloadLines: { productId: string; actualQuantity: number; unitCost?: number }[] =
      [];
    for (const row of lines) {
      const q = Number(row.actualQty);
      if (!row.productId || !Number.isFinite(q) || q < 0) continue;
      payloadLines.push({ productId: row.productId, actualQuantity: q });
    }
    if (payloadLines.length === 0) {
      alert(t("inventory.physicalNeedLines"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/inventory/physical-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId,
          date,
          docType,
          reason: reason.trim() || undefined,
          lines: payloadLines,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setMessage(text.slice(0, 400));
        return;
      }
      const created = (await res.json()) as { id: string };
      setDraftId(created.id);
      setMessage(t("inventory.physicalDraftOk"));
    } finally {
      setBusy(false);
    }
  }

  async function onPost() {
    if (!token || !draftId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(
        `/api/inventory/physical-adjustments/${encodeURIComponent(draftId)}/post`,
        { method: "POST" },
      );
      if (!res.ok) {
        const text = await res.text();
        setMessage(text.slice(0, 400));
        return;
      }
      setMessage(t("inventory.physicalPostedOk"));
      setDraftId(null);
      void loadStock();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <ModulePageLinks
        items={[
          { href: "/inventory", labelKey: "nav.inventory" },
          { href: "/inventory/physical", labelKey: "inventory.physicalNav" },
        ]}
      />
      <Link href="/inventory" className={`text-[13px] ${LINK_ACCENT_CLASS}`}>
        ← {t("inventory.backList")}
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-[#34495E]">{t("inventory.physicalTitle")}</h1>
      <p className="mt-1 text-[13px] text-[#7F8C8D]">{t("inventory.physicalHint")}</p>

      <form onSubmit={onSaveDraft} className={`mt-6 ${CARD_CONTAINER_CLASS} p-4 md:p-5`}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-[#34495E]">{t("inventory.whSelect")}</span>
            <select
              className={INPUT_BORDERED_CLASS}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
            >
              <option value="">{t("inventory.transferPickProduct")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-[#34495E]">{t("inventory.physicalDocDate")}</span>
            <input
              type="date"
              className={INPUT_BORDERED_CLASS}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium text-[#34495E]">{t("inventory.physicalDocType")}</span>
            <select
              className={INPUT_BORDERED_CLASS}
              value={docType}
              onChange={(e) => setDocType(e.target.value as (typeof DOC_TYPES)[number])}
            >
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`inventory.physicalDocType_${d}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] md:col-span-2">
            <span className="font-medium text-[#34495E]">{t("inventory.physicalReason")}</span>
            <input
              type="text"
              className={INPUT_BORDERED_CLASS}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("inventory.physicalReasonPh")}
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[#34495E]">{t("inventory.physicalLines")}</span>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={addLine}>
            + {t("inventory.transferAddLine")}
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[#7F8C8D]">
                <th className="p-2">{t("inventory.thProduct")}</th>
                <th className="p-2 text-right">{t("inventory.physicalBookQty")}</th>
                <th className="p-2 text-right">{t("inventory.physicalActualQty")}</th>
                <th className="p-2 text-right">{t("inventory.physicalDelta")}</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((row, i) => {
                const book = bookByProduct.get(row.productId);
                const bookN = book != null && Number.isFinite(book) ? book : null;
                const act = Number(row.actualQty);
                const delta =
                  row.productId && Number.isFinite(act) && bookN != null ? act - bookN : null;
                return (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-2">
                      <select
                        className={`${INPUT_BORDERED_CLASS} w-full max-w-xs`}
                        value={row.productId}
                        onChange={(e) => updateLine(i, { productId: e.target.value })}
                      >
                        <option value="">{t("inventory.transferPickProduct")}</option>
                        {productGoods.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-600">
                      {row.productId
                        ? bookN != null
                          ? bookN
                          : "0"
                        : "—"}
                    </td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={`${INPUT_BORDERED_CLASS} w-28 text-right inline-block`}
                        value={row.actualQty}
                        onChange={(e) => updateLine(i, { actualQty: e.target.value })}
                      />
                    </td>
                    <td className="p-2 text-right tabular-nums font-medium text-[#34495E]">
                      {delta != null && Number.isFinite(delta) ? delta : "—"}
                    </td>
                    <td className="p-2">
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          className="text-rose-600 text-xs hover:underline"
                          onClick={() => removeLine(i)}
                        >
                          ×
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-500">{t("inventory.physicalDeltaNote")}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
            {busy ? "…" : t("inventory.physicalSaveDraft")}
          </button>
          {draftId ? (
            <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={busy} onClick={onPost}>
              {busy ? "…" : t("inventory.physicalPost")}
            </button>
          ) : null}
        </div>
      </form>

      {message ? (
        <pre className="mt-4 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {message}
        </pre>
      ) : null}
    </div>
  );
}
