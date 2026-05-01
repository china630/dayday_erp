"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { formatMoneyAzn } from "../../lib/format-money";
import { useRequireAuth } from "../../lib/use-require-auth";
import { subscribeListRefresh } from "../../lib/list-refresh-bus";
import { PageHeader } from "../../components/layout/page-header";
import { EmptyState } from "../../components/empty-state";
import {
  BORDER_MUTED_CLASS,
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

type Warehouse = { id: string; name: string; location: string };

type StockRow = {
  id: string;
  quantity: unknown;
  averageCost: unknown;
  product: { id: string; name: string; sku: string };
  warehouse: { id: string; name: string };
  bin?: { id: string; code: string } | null;
};

function fmtQty(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [filterWh, setFilterWh] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = filterWh ? `?warehouseId=${encodeURIComponent(filterWh)}` : "";
      const [w, s] = await Promise.all([
        apiFetch("/api/inventory/warehouses"),
        apiFetch(`/api/inventory/stock${q}`),
      ]);
      if (!w.ok) throw new Error(`warehouses ${w.status}`);
      if (!s.ok) throw new Error(`stock ${s.status}`);
      setWarehouses(await w.json());
      setStock(await s.json());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [filterWh, token]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    if (!ready || !token) return;
    return subscribeListRefresh("inventory-hub", () => void load());
  }, [load, ready, token]);

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <PageHeader title={t("inventory.title")} />
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
        <h2 className="text-lg font-semibold text-[#34495E] m-0">{t("inventory.stockBalancesTitle")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium text-gray-700">
            {t("inventory.filterWh")}
            <select
              value={filterWh}
              onChange={(e) => setFilterWh(e.target.value)}
              className={`mt-1 block max-w-md ${INPUT_BORDERED_CLASS}`}
            >
              <option value="">{t("inventory.allWh")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void load()} className={`${SECONDARY_BUTTON_CLASS} px-4`}>
            {t("inventory.refresh")}
          </button>
        </div>
      </section>

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && stock.length === 0 && !error && (
        <EmptyState
          icon={<Package className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />}
          title={t("inventory.emptyStock")}
          description={t("inventory.emptyStockHint")}
          action={
            <Link href="/purchases" className={PRIMARY_BUTTON_CLASS}>
              + {t("inventory.newPurchaseBtn")}
            </Link>
          }
        />
      )}
      {!loading && stock.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {stock.map((r) => (
              <div
                key={r.id}
                className={`rounded-[2px] ${BORDER_MUTED_CLASS} border bg-white p-4 shadow-sm text-sm space-y-1`}
              >
                <div className="font-medium text-gray-900">{r.product.name}</div>
                <div className="text-slate-600">
                  {t("inventory.thSku")}: {r.product.sku}
                </div>
                <div>
                  {t("inventory.thWh")}: {r.warehouse.name}
                </div>
                <div>
                  {t("inventory.thQty")}: {fmtQty(r.quantity)}
                </div>
                <div>
                  {t("inventory.thAvgCost")}: {formatMoneyAzn(r.averageCost)}
                </div>
              </div>
            ))}
          </div>
          <div
            className={`hidden md:block overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm`}
          >
            <table className="text-sm min-w-full">
              <thead>
                <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                  <th className="text-left p-2">{t("inventory.thWh")}</th>
                  <th className="text-left p-2">{t("inventory.thProduct")}</th>
                  <th className="text-left p-2">{t("inventory.thSku")}</th>
                  <th className="text-left p-2">{t("inventory.thQty")}</th>
                  <th className="text-left p-2">{t("inventory.thBin")}</th>
                  <th className="text-right p-2">{t("inventory.thAvgCost")}</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => (
                  <tr key={r.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                    <td className="p-2">{r.warehouse.name}</td>
                    <td className="p-2">{r.product.name}</td>
                    <td className="p-2">{r.product.sku}</td>
                    <td className="p-2">{fmtQty(r.quantity)}</td>
                    <td className="p-2">{r.bin?.code ?? "—"}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(r.averageCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
