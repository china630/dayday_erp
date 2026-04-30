"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  notifyListRefresh,
  subscribeListRefresh,
} from "../../../lib/list-refresh-bus";
import { InventoryAuditCreateFlow } from "../../../components/inventory/inventory-audit-create-flow";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/empty-state";
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type AuditRow = {
  id: string;
  date: string;
  status: string;
  createdAt: string;
  warehouse?: { id: string; name: string } | null;
};

export default function InventoryAuditsHistoryPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditCreateOpen, setAuditCreateOpen] = useState(false);
  const [auditFlowKey, setAuditFlowKey] = useState(0);

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

  useEffect(() => {
    if (!ready || !token) return;
    return subscribeListRefresh("inventory-audits", () => void load());
  }, [load, ready, token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("newAudit") === "1") {
      setAuditFlowKey((k) => k + 1);
      setAuditCreateOpen(true);
      router.replace("/inventory/audits", { scroll: false });
    }
  }, [router]);

  function openAuditCreate() {
    setAuditFlowKey((k) => k + 1);
    setAuditCreateOpen(true);
  }

  function closeAuditCreate() {
    setAuditCreateOpen(false);
    notifyListRefresh("inventory-audits");
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
      <PageHeader
        title={t("inventory.auditHistoryTitle")}
        subtitle={t("inventory.auditHistoryLead")}
        actions={
          <>
            <button
              type="button"
              onClick={() => openAuditCreate()}
              className={SECONDARY_BUTTON_CLASS}
            >
              {t("inventory.auditNav")}
            </button>
            <Link href="/inventory" className={SECONDARY_BUTTON_CLASS}>
              {t("inventory.auditBack")}
            </Link>
          </>
        }
      />

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
            <button type="button" onClick={() => openAuditCreate()} className={PRIMARY_BUTTON_CLASS}>
              {t("inventory.auditNewInventoryBtn")}
            </button>
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

      {auditCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex shrink-0 items-center justify-end border-b border-slate-100 px-3 py-2">
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => closeAuditCreate()}
                aria-label={t("common.cancel")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <InventoryAuditCreateFlow
                key={auditFlowKey}
                onNavigateToHistory={() => closeAuditCreate()}
                onBackToInventory={() => {
                  setAuditCreateOpen(false);
                  router.push("/inventory");
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
