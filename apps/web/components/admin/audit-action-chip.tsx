"use client";

import { useTranslation } from "react-i18next";

export function AuditActionChip({
  semanticAction,
  httpAction,
}: {
  semanticAction: "CREATE" | "UPDATE" | "DELETE" | "OTHER";
  httpAction: string;
}) {
  const { t } = useTranslation();
  const label =
    semanticAction === "CREATE"
      ? t("securityAuditPage.actionCreate")
      : semanticAction === "UPDATE"
        ? t("securityAuditPage.actionUpdate")
        : semanticAction === "DELETE"
          ? t("securityAuditPage.actionDelete")
          : httpAction;

  const cls =
    semanticAction === "CREATE"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : semanticAction === "UPDATE"
        ? "bg-amber-100 text-amber-950 border-amber-200"
        : semanticAction === "DELETE"
          ? "bg-red-100 text-red-900 border-red-200"
          : "bg-slate-100 text-slate-800 border-[#D5DADF]";

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold border ${cls}`}
      title={httpAction}
    >
      {label}
    </span>
  );
}
