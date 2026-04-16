"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";

type ItemRow = {
  productId: string;
  systemQty: unknown;
  factQty: unknown;
  costPrice: unknown;
};

type AuditDetail = {
  id: string;
  date: string;
  status: string;
  warehouseId: string;
  warehouse?: { id: string; name: string } | null;
  createdAt: string;
  lines?: Array<
    ItemRow & {
      id: string;
      product?: { id: string; name: string; sku: string } | null;
    }
  >;
};

function numStr(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

export default function InventoryAuditDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { token, ready } = useRequireAuth();
  const [row, setRow] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch(`/api/inventory/audits/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError(await res.text());
      setRow(null);
    } else {
      setRow((await res.json()) as AuditDetail);
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    if (!ready || !token || !id) return;
    void load();
  }, [load, ready, token, id]);

  const lines = row?.lines ?? [];

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
          { href: "/inventory/audits", labelKey: "inventory.auditHistoryTitle" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {t("inventory.auditDetailTitle")}
          </h1>
          {row && (
            <p className="text-sm text-slate-600 mt-1">
              {typeof row.date === "string" ? row.date.slice(0, 10) : "—"} ·{" "}
              {row.status === "APPROVED"
                ? t("inventory.auditStatusApproved")
                : row.status === "DRAFT"
                  ? t("inventory.auditStatusDraft")
                  : row.status}
            </p>
          )}
        </div>
        <Link
          href="/inventory/audits"
          className="text-sm text-action hover:text-primary"
        >
          {t("inventory.auditHistoryBack")}
        </Link>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

      {!loading && row && lines.length > 0 && (
        <section className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left p-2">{t("inventory.auditThProduct")}</th>
                <th className="text-left p-2">{t("inventory.thSku")}</th>
                <th className="text-right p-2">{t("inventory.auditThSystem")}</th>
                <th className="text-right p-2">{t("inventory.auditThFact")}</th>
                <th className="text-right p-2">{t("inventory.auditThDiff")}</th>
                <th className="text-right p-2">{t("inventory.auditThCost")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((it, i) => (
                <tr
                  key={`${it.productId}-${i}`}
                  className="border-t border-slate-50"
                >
                  <td className="p-2 text-xs">
                    {"product" in it && it.product ? it.product.name : it.productId}
                  </td>
                  <td className="p-2 font-mono text-xs">
                    {"product" in it && it.product ? it.product.sku : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">{numStr(it.systemQty)}</td>
                  <td className="p-2 text-right tabular-nums">{numStr(it.factQty)}</td>
                  <td className="p-2 text-right tabular-nums">
                    {(Number(numStr(it.factQty)) - Number(numStr(it.systemQty))).toFixed(2)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{numStr(it.costPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!loading && row && lines.length === 0 && (
        <p className="text-sm text-slate-600">{t("inventory.auditDetailNoLines")}</p>
      )}
    </div>
  );
}
