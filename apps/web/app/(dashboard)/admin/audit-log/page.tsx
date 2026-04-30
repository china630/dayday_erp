"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../../lib/design-system";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { PageHeader } from "../../../../components/layout/page-header";
import { AuditActionChip } from "../../../../components/admin/audit-action-chip";
import { AuditDiffModal } from "../../../../components/admin/audit-diff-modal";

type Semantic = "CREATE" | "UPDATE" | "DELETE" | "OTHER";

type AdminAuditRow = {
  id: string;
  userId: string | null;
  actorDisplayName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  semanticAction: Semantic;
  createdAt: string;
  oldValues: unknown;
  newValues: unknown;
  objectLabel: string;
  invoiceNumber: string | null;
  employeeDisplayName: string | null;
};

export default function AdminSecurityAuditLogPage() {
  const { t } = useTranslation();
  const { ready, token } = useRequireAuth();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";

  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [entityName, setEntityName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AdminAuditRow | null>(null);

  const maxPage = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  const objectLabel = useCallback(
    (r: AdminAuditRow) => {
      if (r.entityType === "Invoice" && r.invoiceNumber) {
        return t("securityAuditPage.objectInvoice", { number: r.invoiceNumber });
      }
      if (r.entityType === "Employee" && r.employeeDisplayName) {
        return t("securityAuditPage.objectEmployee", { name: r.employeeDisplayName });
      }
      const typeLabel = t(`auditEntity.${r.entityType}`, {
        defaultValue: r.entityType,
      });
      return `${typeLabel} · ${r.entityId}`;
    },
    [t],
  );

  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (!token || !isOwner) {
        return;
      }
      setLoadErr(null);
      setBusy(true);
      try {
        const q = new URLSearchParams();
        q.set("page", String(pageNum));
        q.set("pageSize", String(pageSize));
        if (userId.trim()) {
          q.set("userId", userId.trim());
        }
        if (entityName.trim()) {
          q.set("entityName", entityName.trim());
        }
        if (from.trim()) {
          q.set("from", new Date(from).toISOString());
        }
        if (to.trim()) {
          const d = new Date(to);
          d.setHours(23, 59, 59, 999);
          q.set("to", d.toISOString());
        }
        const res = await apiFetch(`/api/admin/audit-logs?${q.toString()}`);
        if (!res.ok) {
          setLoadErr(`${res.status}`);
          setRows([]);
          setTotal(0);
          return;
        }
        const body = (await res.json()) as {
          items: AdminAuditRow[];
          total: number;
        };
        setRows(body.items ?? []);
        setTotal(body.total ?? 0);
      } finally {
        setBusy(false);
      }
    },
    [token, isOwner, pageSize, userId, entityName, from, to],
  );

  useEffect(() => {
    if (!ready || !token || !isOwner) {
      return;
    }
    void fetchPage(page);
  }, [ready, token, isOwner, page, fetchPage]);

  if (!ready || !token) {
    return <div className="text-sm text-[#7F8C8D]">{t("common.loading")}</div>;
  }

  if (!isOwner) {
    return (
      <div className="max-w-3xl space-y-4">
        <PageHeader
          title={t("securityAuditPage.title")}
          subtitle={t("securityAuditPage.ownerOnly")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title={t("securityAuditPage.title")} subtitle={t("securityAuditPage.subtitle")} />

      <section className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
        <h2 className="text-[13px] font-semibold text-[#34495E]">
          {t("securityAuditPage.filters")}
        </h2>
        <div className="flex flex-wrap gap-3 items-end text-[13px]">
          <label className="text-[#34495E]">
            {t("securityAuditPage.filterUser")}
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="UUID"
              className={`block mt-1 w-64 ${INPUT_BORDERED_CLASS}`}
            />
          </label>
          <label className="text-[#34495E]">
            {t("securityAuditPage.filterEntity")}
            <input
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder="Invoice, Employee…"
              className={`block mt-1 w-44 ${INPUT_BORDERED_CLASS}`}
            />
          </label>
          <label className="text-[#34495E]">
            {t("auditPage.filterFrom")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`block mt-1 ${INPUT_BORDERED_CLASS}`}
            />
          </label>
          <label className="text-[#34495E]">
            {t("auditPage.filterTo")}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`block mt-1 ${INPUT_BORDERED_CLASS}`}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (page === 1) {
                void fetchPage(1);
              } else {
                setPage(1);
              }
            }}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {t("auditPage.apply")}
          </button>
        </div>
      </section>

      {loadErr && <p className="text-red-600 text-sm">{loadErr}</p>}

      <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
        <table className="min-w-full text-[13px]">
          <thead className="bg-gray-50 text-left text-[#7F8C8D]">
            <tr>
              <th className="px-3 py-2 font-medium">{t("securityAuditPage.colWhen")}</th>
              <th className="px-3 py-2 font-medium">{t("securityAuditPage.colWho")}</th>
              <th className="px-3 py-2 font-medium">{t("securityAuditPage.colAction")}</th>
              <th className="px-3 py-2 font-medium">{t("securityAuditPage.colObject")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-t border-[#D5DADF] ${
                  r.semanticAction === "UPDATE"
                    ? "cursor-pointer hover:bg-slate-50/80"
                    : ""
                }`}
                onClick={() => {
                  if (r.semanticAction === "UPDATE") {
                    setSelected(r);
                  }
                }}
              >
                <td className="px-3 py-2 whitespace-nowrap text-[#34495E]">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-[#34495E]">
                  {r.actorDisplayName ?? r.userId ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <AuditActionChip
                    semanticAction={r.semanticAction}
                    httpAction={r.action}
                  />
                </td>
                <td className="px-3 py-2 text-[#34495E]">{objectLabel(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#7F8C8D]">
          <span>
            {t("securityAuditPage.paginationShort", {
              page,
              maxPage,
              total,
            })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || busy}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`${SECONDARY_BUTTON_CLASS} px-3 py-1 text-xs disabled:opacity-40`}
            >
              {t("employees.prevPage")}
            </button>
            <button
              type="button"
              disabled={page >= maxPage || busy}
              onClick={() => setPage((p) => p + 1)}
              className={`${SECONDARY_BUTTON_CLASS} px-3 py-1 text-xs disabled:opacity-40`}
            >
              {t("employees.nextPage")}
            </button>
          </div>
        </div>
      )}

      <AuditDiffModal
        open={Boolean(selected)}
        title={t("securityAuditPage.diffTitle")}
        oldValues={selected?.oldValues}
        newValues={selected?.newValues}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
