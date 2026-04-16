"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ClipboardList } from "lucide-react";
import { ModulePageLinks } from "../../../components/module-page-links";
import { EmptyState } from "../../../components/empty-state";
import { PRIMARY_BUTTON_CLASS } from "../../../lib/design-system";

type AuditRow = {
  id: string;
  date: string;
  status: string;
  createdAt: string;
  warehouse?: { id: string; name: string } | null;
};

export default function InventoryAuditsHistoryPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/inventory/audits");
    if (!res.ok) {
      setError(`${t("inventory.loadErr")}: ${res.status}`);
      setRows([]);
    } else {
      setRows((await res.json()) as AuditRow[]);
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
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
    <div className="space-y-8 max-w-5xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/inventory", labelKey: "nav.inventory" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {t("inventory.auditHistoryTitle")}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t("inventory.auditHistoryLead")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/inventory/audit/new"
            className="text-sm text-action hover:text-primary"
          >
            {t("inventory.auditNav")}
          </Link>
          <Link href="/inventory" className="text-sm text-slate-600 hover:text-slate-900">
            {t("inventory.auditBack")}
          </Link>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

      {!loading && rows.length === 0 && !error && (
        <EmptyState
          icon={
            <ClipboardList className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />
          }
          title={t("inventory.auditHistoryEmpty")}
          description={t("inventory.auditHistoryEmptyHint")}
          action={
            <Link href="/inventory/audit/new" className={PRIMARY_BUTTON_CLASS}>
              {t("inventory.auditNewInventoryBtn")}
            </Link>
          }
        />
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left p-2">{t("inventory.auditThDateDoc")}</th>
                <th className="text-left p-2">{t("inventory.thWh")}</th>
                <th className="text-left p-2">{t("inventory.auditThStatus")}</th>
                <th className="text-left p-2">{t("inventory.auditThCreated")}</th>
                <th className="text-right p-2">{t("inventory.auditThOpen")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-50">
                  <td className="p-2 whitespace-nowrap">
                    {typeof r.date === "string" ? r.date.slice(0, 10) : "—"}
                  </td>
                  <td className="p-2 whitespace-nowrap text-slate-700">
                    {r.warehouse?.name ?? "—"}
                  </td>
                  <td className="p-2 whitespace-nowrap text-slate-600">
                    {r.status === "APPROVED"
                      ? t("inventory.auditStatusApproved")
                      : r.status === "DRAFT"
                        ? t("inventory.auditStatusDraft")
                        : r.status}
                  </td>
                  <td className="p-2 text-slate-600 whitespace-nowrap">
                    {r.createdAt?.slice(0, 19)?.replace("T", " ") ?? "—"}
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      href={`/inventory/audits/${r.id}`}
                      className="text-action hover:text-primary font-medium"
                    >
                      {t("inventory.auditOpen")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
