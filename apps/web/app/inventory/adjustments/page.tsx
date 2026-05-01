"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { subscribeListRefresh } from "../../../lib/list-refresh-bus";
import { PageHeader } from "../../../components/layout/page-header";
import { AdjustmentsModal } from "../../../components/inventory/modals";
import { BORDER_MUTED_CLASS, PRIMARY_BUTTON_CLASS } from "../../../lib/design-system";

type Movement = {
  id: string;
  type: string;
  quantity: unknown;
  price: unknown;
  createdAt: string;
  documentDate?: string;
  note: string | null;
  product: { name: string; sku?: string };
  warehouse: { name: string };
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

export default function InventoryAdjustmentsPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        take: "500",
        notes: "INV_ADJ_IN,INV_ADJ_OUT",
      });
      const res = await apiFetch(`/api/inventory/movements?${q.toString()}`);
      if (!res.ok) throw new Error(`movements ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    if (!ready || !token) return;
    return subscribeListRefresh("inventory-adjustments", () => void load());
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
      <PageHeader
        title={t("inventory.adjustmentsPageTitle")}
        actions={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setModalOpen(true)}>
            + {t("inventory.newAdjustBtn")}
          </button>
        }
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && rows.length === 0 && !error && (
        <p className="text-sm text-slate-600">{t("inventory.emptyMovementsHint")}</p>
      )}
      {!loading && rows.length > 0 && (
        <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm`}>
          <table className="text-sm min-w-full">
            <thead>
              <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                <th className="text-left p-2">{t("inventory.thMovDate")}</th>
                <th className="text-left p-2">{t("inventory.thWh")}</th>
                <th className="text-left p-2">{t("inventory.thProduct")}</th>
                <th className="text-left p-2">{t("inventory.thMovType")}</th>
                <th className="text-left p-2">{t("inventory.thQty")}</th>
                <th className="text-right p-2">{t("inventory.thMovPrice")}</th>
                <th className="text-left p-2">{t("inventory.thNote")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                  <td className="p-2 whitespace-nowrap">{rowDate(m)}</td>
                  <td className="p-2">{m.warehouse.name}</td>
                  <td className="p-2">
                    {m.product.name}
                    {m.product.sku ? ` (${m.product.sku})` : ""}
                  </td>
                  <td className="p-2">{m.type}</td>
                  <td className="p-2">{fmtQty(m.quantity)}</td>
                  <td className="p-2 text-right font-mono">{formatMoneyAzn(m.price)}</td>
                  <td className="p-2 text-xs">{m.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdjustmentsModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
