"use client";

import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buildJsonDiff } from "../../lib/audit-json-diff";
import { CARD_CONTAINER_CLASS, MODAL_FOOTER_ACTIONS_CLASS } from "../../lib/design-system";
import { Button } from "../ui/button";

function formatCell(v: unknown, emptyLabel: string): string {
  if (v === undefined) {
    return emptyLabel;
  }
  if (v === null) {
    return "null";
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function AuditDiffModal({
  open,
  title,
  oldValues,
  newValues,
  onClose,
}: {
  open: boolean;
  title: string;
  oldValues: unknown;
  newValues: unknown;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!open) {
    return null;
  }
  const rows = buildJsonDiff(oldValues, newValues);
  const emptyLabel = t("common.emptyValue");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
    >
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden bg-white p-6 shadow-sm`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <h3 className="m-0 min-w-0 flex-1 pr-2 text-lg font-semibold leading-snug text-[#34495E]">{title}</h3>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>
        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-[2px] border border-[#D5DADF] bg-[#EBEDF0] p-4">
          {rows.length === 0 ? (
            <p className="m-0 text-[13px] text-[#7F8C8D]">{t("securityAuditPage.diffEmpty")}</p>
          ) : (
            <div className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
              <table className="min-w-full text-[13px]">
                <thead className="bg-[#F4F5F7] text-left text-[#7F8C8D]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t("securityAuditPage.diffColField")}</th>
                    <th className="px-3 py-2 font-semibold">{t("securityAuditPage.diffColBefore")}</th>
                    <th className="px-3 py-2 font-semibold">{t("securityAuditPage.diffColAfter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.path} className="border-t border-[#D5DADF] align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-[#34495E]">{r.path}</td>
                      <td className="max-w-[280px] whitespace-pre-wrap px-3 py-2 font-mono text-[13px] text-red-800">
                        {formatCell(r.oldValue, emptyLabel)}
                      </td>
                      <td className="max-w-[280px] whitespace-pre-wrap px-3 py-2 font-mono text-[13px] text-emerald-900">
                        {formatCell(r.newValue, emptyLabel)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 grid gap-3 text-[13px] md:grid-cols-2">
            <div>
              <div className="mb-1 font-semibold text-[#34495E]">{t("securityAuditPage.rawOld")}</div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[2px] border border-[#D5DADF] bg-white p-2">
                {formatCell(oldValues, emptyLabel)}
              </pre>
            </div>
            <div>
              <div className="mb-1 font-semibold text-[#34495E]">{t("securityAuditPage.rawNew")}</div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-[2px] border border-[#D5DADF] bg-white p-2">
                {formatCell(newValues, emptyLabel)}
              </pre>
            </div>
          </div>
        </div>
        <div className={MODAL_FOOTER_ACTIONS_CLASS}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
