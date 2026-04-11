"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";
import { EmptyState } from "../../../../components/empty-state";

type StockRow = {
  quantity: unknown;
  averageCost: unknown;
  product: { id: string; name: string; sku: string };
  warehouse: { id: string; name: string };
};

type RowState = {
  warehouseId: string;
  productId: string;
  systemQty: string;
  factQty: string;
  inventoryAccountCode: "201" | "204";
};

function qtyStr(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

export default function InventoryAuditNewPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "approved" | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/inventory/stock");
    if (!res.ok) {
      setError(`${t("inventory.loadErr")}: ${res.status}`);
      setStock([]);
      setRows([]);
    } else {
      const data = (await res.json()) as StockRow[];
      setStock(data);
      setRows(
        data.map((r) => ({
          warehouseId: r.warehouse.id,
          productId: r.product.id,
          systemQty: qtyStr(r.quantity),
          factQty: qtyStr(r.quantity),
          inventoryAccountCode: "201",
        })),
      );
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  const dateStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  function setFact(i: number, v: string) {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[i];
      if (cur) next[i] = { ...cur, factQty: v };
      return next;
    });
  }

  function setAcc(i: number, v: "201" | "204") {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[i];
      if (cur) next[i] = { ...cur, inventoryAccountCode: v };
      return next;
    });
  }

  async function submit(status: "DRAFT" | "APPROVED") {
    if (!token || busy) return;
    setBusy(status === "DRAFT" ? "draft" : "approved");
    setError(null);
    const items = rows.map((r) => ({
      warehouseId: r.warehouseId,
      productId: r.productId,
      factQty: Number(r.factQty),
      inventoryAccountCode: r.inventoryAccountCode,
    }));
    const res = await apiFetch("/api/inventory/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr, status, items }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    alert(status === "APPROVED" ? t("inventory.auditOkApproved") : t("inventory.auditOkDraft"));
    await load();
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8 max-w-5xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/inventory", labelKey: "nav.inventory" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("inventory.auditTitle")}</h1>
          <p className="text-sm text-slate-600 mt-1">{t("inventory.auditSubtitle")}</p>
        </div>
        <Link
          href="/inventory"
          className="text-sm text-action hover:text-primary"
        >
          {t("inventory.auditBack")}
        </Link>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

      {!loading && rows.length === 0 && !error && (
        <EmptyState title={t("inventory.auditEmpty")} description={t("inventory.emptyStockHint")} />
      )}

      {!loading && rows.length > 0 && (
        <section className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left p-2">{t("inventory.thWh")}</th>
                <th className="text-left p-2">{t("inventory.thProduct")}</th>
                <th className="text-left p-2">{t("inventory.thSku")}</th>
                <th className="text-right p-2">{t("inventory.auditThSystem")}</th>
                <th className="text-right p-2">{t("inventory.auditThFact")}</th>
                <th className="text-left p-2">{t("inventory.auditAcc")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const meta = stock[i];
                return (
                  <tr key={`${r.warehouseId}-${r.productId}`} className="border-t border-slate-50">
                    <td className="p-2">{meta?.warehouse.name ?? "—"}</td>
                    <td className="p-2">{meta?.product.name ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{meta?.product.sku ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums text-slate-600">{r.systemQty}</td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                        value={r.factQty}
                        onChange={(e) => setFact(i, e.target.value)}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="rounded border border-slate-200 px-2 py-1 text-xs"
                        value={r.inventoryAccountCode}
                        onChange={(e) => setAcc(i, e.target.value as "201" | "204")}
                      >
                        <option value="201">{t("inventory.adjustInv201")}</option>
                        <option value="204">{t("inventory.adjustInv204")}</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void submit("DRAFT")}
            className="inline-flex items-center justify-center gap-2 min-h-[2.5rem] px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none"
          >
            {busy === "draft" && (
              <span
                className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
                aria-hidden
              />
            )}
            {busy === "draft" ? t("inventory.auditSaving") : t("inventory.auditSaveDraft")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void submit("APPROVED")}
            className="inline-flex items-center justify-center gap-2 min-h-[2.5rem] px-4 py-2 rounded-lg bg-action text-white text-sm font-medium hover:bg-action-hover disabled:opacity-60 disabled:pointer-events-none"
          >
            {busy === "approved" && (
              <span
                className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent"
                aria-hidden
              />
            )}
            {busy === "approved" ? t("inventory.auditPosting") : t("inventory.auditApprove")}
          </button>
        </div>
      )}
      <p className="text-xs text-slate-500 max-w-2xl">{t("inventory.auditApproveHint")}</p>
    </div>
  );
}
