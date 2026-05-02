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
import { PurchaseModal } from "../../components/inventory/modals";
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
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

type Movement = {
  id: string;
  quantity: unknown;
  price: unknown;
  createdAt: string;
  documentDate?: string;
  note: string | null;
  product: { name: string; sku?: string };
  warehouse: { name: string };
  bin?: { id: string; code: string } | null;
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

export default function InventoryPurchasePage() {
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
        take: "400",
        type: "IN",
        reason: "PURCHASE",
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
      <PageHeader
        title={t("inventory.purchasesRegistryTitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setModalOpen(true)}>
              + {t("inventory.purchaseNewOpenBtn")}
            </button>
            <Link href="/inventory" className={SECONDARY_BUTTON_CLASS}>
              {t("inventory.backList")}
            </Link>
          </div>
        }
      />
      <p className="text-sm text-slate-600 m-0">{t("inventory.purchaseRegistryHint")}</p>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && rows.length === 0 && !error && (
        <EmptyState
          icon={<Package className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />}
          title={t("inventory.purchasesRegistryTitle")}
          description={t("inventory.purchaseEmptyRegistryHint")}
          action={
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setModalOpen(true)}>
              + {t("inventory.purchaseNewOpenBtn")}
            </button>
          }
        />
      )}
      {!loading && rows.length > 0 && (
        <div className={DATA_TABLE_VIEWPORT_CLASS}>
          <table className={`${DATA_TABLE_CLASS} min-w-full`}>
            <thead>
              <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("inventory.purchaseThDate")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.thWh")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.thProduct")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.thSku")}</th>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("inventory.thQty")}</th>
                <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("inventory.thMovPrice")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.purchaseThRef")}</th>
                <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("inventory.thBin")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={DATA_TABLE_TR_CLASS}>
                  <td className={`${DATA_TABLE_TD_RIGHT_CLASS} whitespace-nowrap`}>{rowDate(m)}</td>
                  <td className={DATA_TABLE_TD_CLASS}>{m.warehouse.name}</td>
                  <td className={DATA_TABLE_TD_CLASS}>{m.product.name}</td>
                  <td className={DATA_TABLE_TD_CLASS}>{m.product.sku ?? "—"}</td>
                  <td className={DATA_TABLE_TD_RIGHT_CLASS}>{fmtQty(m.quantity)}</td>
                  <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(m.price)}</td>
                  <td className={DATA_TABLE_TD_CLASS}>{m.note?.trim() || "—"}</td>
                  <td className={DATA_TABLE_TD_CLASS}>{m.bin?.code ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PurchaseModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={() => void load()} />
    </div>
  );
}
