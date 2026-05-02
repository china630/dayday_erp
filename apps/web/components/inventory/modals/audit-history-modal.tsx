"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { EmptyState } from "../../empty-state";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

type AuditRow = {
  id: string;
  date: string;
  status: string;
  createdAt: string;
  warehouse?: { id: string; name: string } | null;
};

export function AuditHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
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
    if (!open || !ready || !token) return;
    void load();
  }, [open, ready, token, load]);

  async function onRefreshSave() {
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/inventory/audits");
    setBusy(false);
    if (!res.ok) {
      const msg = `${t("inventory.loadErr")}: ${res.status}`;
      setError(msg);
      toast.error(t("common.saveErr"), { description: msg });
      return;
    }
    setRows((await res.json()) as AuditRow[]);
    toast.success(t("common.save"));
    onClose();
  }

  if (!open) return null;

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.auditHistoryTitle")}
      subtitle={t("inventory.auditHistoryLead")}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      footer={
        <InventoryModalFooter onCancel={onClose} onSave={() => void onRefreshSave()} busy={busy} />
      }
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p>}

      {!loading && rows.length === 0 && !error && (
        <EmptyState
          icon={
            <ClipboardList className="mx-auto h-12 w-12 stroke-[1.5] text-[#7F8C8D]" aria-hidden />
          }
          title={t("inventory.auditHistoryEmpty")}
          description={t("inventory.auditHistoryEmptyHint")}
        />
      )}

      {!loading && rows.length > 0 && (
        <div className={`overflow-x-auto rounded-[2px] border border-[#D5DADF] bg-white shadow-sm`}>
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#EBEDF0]">
                <th className="p-2 text-left">{t("inventory.auditThDateDoc")}</th>
                <th className="p-2 text-left">{t("inventory.thWh")}</th>
                <th className="p-2 text-left">{t("inventory.auditThStatus")}</th>
                <th className="p-2 text-left">{t("inventory.auditThCreated")}</th>
                <th className="p-2 text-right">{t("inventory.auditThOpen")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#EBEDF0]">
                  <td className="whitespace-nowrap p-2">
                    {typeof r.date === "string" ? r.date.slice(0, 10) : t("common.emptyValue")}
                  </td>
                  <td className="whitespace-nowrap p-2 text-slate-700">
                    {r.warehouse?.name ?? t("common.emptyValue")}
                  </td>
                  <td className="whitespace-nowrap p-2 text-slate-600">
                    {r.status === "APPROVED"
                      ? t("inventory.auditStatusApproved")
                      : r.status === "DRAFT"
                        ? t("inventory.auditStatusDraft")
                        : r.status}
                  </td>
                  <td className="whitespace-nowrap p-2 text-slate-600">
                    {r.createdAt?.slice(0, 19)?.replace("T", " ") ?? t("common.emptyValue")}
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      href={`/inventory/audits/${r.id}`}
                      className="font-medium text-[#2980B9] hover:text-[#34495E] hover:underline"
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
    </InventoryModalShell>
  );
}
