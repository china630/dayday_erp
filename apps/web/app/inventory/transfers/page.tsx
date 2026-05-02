"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { subscribeListRefresh } from "../../../lib/list-refresh-bus";
import { PageHeader } from "../../../components/layout/page-header";
import { TransferModal } from "../../../components/inventory/modals";
import {
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type Movement = {
  id: string;
  quantity: unknown;
  price: unknown;
  createdAt: string;
  documentDate?: string;
  transferBatchId?: string | null;
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

export default function InventoryTransfersPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<Movement[]>([]);
  const [toByBatch, setToByBatch] = useState<Record<string, string>>({});
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
      const qOut = new URLSearchParams({ take: "500", note: "TRANSFER_OUT" });
      const qIn = new URLSearchParams({ take: "500", note: "TRANSFER_IN" });
      const [outRes, inRes] = await Promise.all([
        apiFetch(`/api/inventory/movements?${qOut.toString()}`),
        apiFetch(`/api/inventory/movements?${qIn.toString()}`),
      ]);
      if (!outRes.ok) throw new Error(`movements ${outRes.status}`);
      if (!inRes.ok) throw new Error(`movements ${inRes.status}`);
      const outs = (await outRes.json()) as Movement[];
      const ins = (await inRes.json()) as Movement[];
      const toMap: Record<string, string> = {};
      for (const m of ins) {
        const bid = m.transferBatchId;
        if (bid) toMap[bid] = m.warehouse.name;
      }
      setToByBatch(toMap);
      setRows(outs);
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
    return subscribeListRefresh("inventory-transfers", () => void load());
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
        title={t("inventory.transfersPageTitle")}
        actions={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setModalOpen(true)}>
            + {t("inventory.newTransferBtn")}
          </button>
        }
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && rows.length === 0 && !error && (
        <p className="text-sm text-slate-600">{t("inventory.emptyMovementsHint")}</p>
      )}
      {!loading && rows.length > 0 && (
        <div className={DATA_TABLE_VIEWPORT_CLASS}>
          <table className={`${DATA_TABLE_CLASS} min-w-full`}>
            <thead>
              <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("inventory.thMovDate")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.transferFrom")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.transferTo")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.thProduct")}</th>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("inventory.thQty")}</th>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("inventory.thMovPrice")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.thTransferBatch")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const bid = m.transferBatchId ?? "—";
                const toName = m.transferBatchId ? toByBatch[m.transferBatchId] ?? "—" : "—";
                return (
                  <tr key={m.id} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} whitespace-nowrap`}>{rowDate(m)}</td>
                    <td className={DATA_TABLE_TD_CLASS}>{m.warehouse.name}</td>
                    <td className={DATA_TABLE_TD_CLASS}>{toName}</td>
                    <td className={DATA_TABLE_TD_CLASS}>
                      {m.product.name}
                      {m.product.sku ? ` (${m.product.sku})` : ""}
                    </td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{fmtQty(m.quantity)}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(m.price)}</td>
                    <td className={`${DATA_TABLE_TD_CLASS} font-mono text-xs`}>
                      {typeof bid === "string" ? bid.slice(0, 8) : bid}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TransferModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
