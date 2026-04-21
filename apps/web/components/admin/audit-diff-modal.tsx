"use client";

import { useTranslation } from "react-i18next";
import { buildJsonDiff } from "../../lib/audit-json-diff";
import { CARD_CONTAINER_CLASS } from "../../lib/design-system";

function formatCell(v: unknown): string {
  if (v === undefined) {
    return "—";
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal
    >
      <div
        className={`${CARD_CONTAINER_CLASS} max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl`}
      >
        <div className="px-4 py-3 border-b border-[#D5DADF] flex justify-between items-center bg-white">
          <h3 className="font-semibold text-[#34495E]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#7F8C8D] hover:text-[#34495E] text-lg leading-none px-2"
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1 bg-[#EBEDF0]">
          {rows.length === 0 ? (
            <p className="text-sm text-[#7F8C8D]">{t("securityAuditPage.diffEmpty")}</p>
          ) : (
            <div className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
              <table className="min-w-full text-[13px]">
                <thead className="bg-gray-50 text-left text-[#7F8C8D]">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("securityAuditPage.diffColField")}</th>
                    <th className="px-3 py-2 font-medium">{t("securityAuditPage.diffColBefore")}</th>
                    <th className="px-3 py-2 font-medium">{t("securityAuditPage.diffColAfter")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.path} className="border-t border-[#D5DADF] align-top">
                      <td className="px-3 py-2 font-mono text-xs text-[#34495E] whitespace-nowrap">
                        {r.path}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-red-800 whitespace-pre-wrap max-w-[280px]">
                        {formatCell(r.oldValue)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-emerald-900 whitespace-pre-wrap max-w-[280px]">
                        {formatCell(r.newValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 grid md:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-medium text-[#34495E] mb-1">
                {t("securityAuditPage.rawOld")}
              </div>
              <pre className="bg-white border border-[#D5DADF] rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                {formatCell(oldValues)}
              </pre>
            </div>
            <div>
              <div className="font-medium text-[#34495E] mb-1">
                {t("securityAuditPage.rawNew")}
              </div>
              <pre className="bg-white border border-[#D5DADF] rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                {formatCell(newValues)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
