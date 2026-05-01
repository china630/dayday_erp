"use client";

import { Package } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { subscribeListRefresh } from "../../../lib/list-refresh-bus";
import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/empty-state";
import { BORDER_MUTED_CLASS, INPUT_BORDERED_CLASS, SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";

type Warehouse = { id: string; name: string };

type Movement = {
  id: string;
  type: string;
  reason: string;
  quantity: unknown;
  price: unknown;
  createdAt: string;
  documentDate?: string;
  note: string | null;
  product: { name: string; sku?: string };
  warehouse: { name: string };
  bin?: { id: string; code: string } | null;
  invoice: { number: string } | null;
};

function fmtQty(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

function rowDate(m: Movement): string {
  const d = m.documentDate ?? m.createdAt;
  return d.slice(0, 19);
}

export default function InventoryMovementsPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
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
      const q = new URLSearchParams();
      q.set("take", "500");
      if (filterWh) q.set("warehouseId", filterWh);
      const [w, m] = await Promise.all([
        apiFetch("/api/inventory/warehouses"),
        apiFetch(`/api/inventory/movements?${q.toString()}`),
      ]);
      if (!w.ok) throw new Error(`warehouses ${w.status}`);
      if (!m.ok) throw new Error(`movements ${m.status}`);
      setWarehouses(await w.json());
      setMovements(await m.json());
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
    return subscribeListRefresh("inventory-movements", () => void load());
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
      <PageHeader title={t("inventory.movementsPageTitle")} />
      {error && <p className="text-red-600 text-sm">{error}</p>}

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

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && movements.length === 0 && !error && (
        <EmptyState
          icon={<Package className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />}
          title={t("inventory.emptyMovements")}
          description={t("inventory.emptyMovementsHint")}
        />
      )}
      {!loading && movements.length > 0 && (
        <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm`}>
          <table className="text-sm min-w-full">
            <thead>
              <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                <th className="text-left p-2">{t("inventory.thMovDate")}</th>
                <th className="text-left p-2">{t("inventory.thWh")}</th>
                <th className="text-left p-2">{t("inventory.thProduct")}</th>
                <th className="text-left p-2">{t("inventory.thMovType")}</th>
                <th className="text-left p-2">{t("inventory.thMovReason")}</th>
                <th className="text-left p-2">{t("inventory.thQty")}</th>
                <th className="text-left p-2">{t("inventory.thBin")}</th>
                <th className="text-right p-2">{t("inventory.thMovPrice")}</th>
                <th className="text-left p-2">{t("inventory.thInvoice")}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                  <td className="p-2 whitespace-nowrap">{rowDate(m)}</td>
                  <td className="p-2">{m.warehouse.name}</td>
                  <td className="p-2">{m.product.name}</td>
                  <td className="p-2">{m.type}</td>
                  <td className="p-2">{m.reason}</td>
                  <td className="p-2">{fmtQty(m.quantity)}</td>
                  <td className="p-2">{m.bin?.code ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{formatMoneyAzn(m.price)}</td>
                  <td className="p-2">{m.invoice?.number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
