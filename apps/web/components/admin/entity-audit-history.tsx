"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { AuditActionChip } from "./audit-action-chip";
import { AuditDiffModal } from "./audit-diff-modal";

type AuditUser = {
  id: string;
  email: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
} | null;

type AuditLogRow = {
  id: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
  oldValues: unknown;
  newValues: unknown;
  user?: AuditUser;
};

function actorLabel(u: AuditUser | undefined, userId: string | null): string {
  if (!u) {
    return userId ?? "—";
  }
  const parts = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (parts) {
    return parts;
  }
  if (u.fullName?.trim()) {
    return u.fullName.trim();
  }
  return u.email;
}

function semanticFromHttp(action: string): "CREATE" | "UPDATE" | "DELETE" | "OTHER" {
  if (action === "POST") {
    return "CREATE";
  }
  if (action === "PATCH" || action === "PUT") {
    return "UPDATE";
  }
  if (action === "DELETE") {
    return "DELETE";
  }
  return "OTHER";
}

export function EntityAuditHistory({
  entityType,
  entityId,
  token,
}: {
  entityType: string;
  entityId: string;
  token: string | null;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const load = useCallback(async () => {
    if (!token || !entityId) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({
      entityType,
      entityId,
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await apiFetch(`/api/audit/logs?${q.toString()}`);
    if (!res.ok) {
      setErr(String(res.status));
      setRows([]);
      setTotal(0);
    } else {
      const body = (await res.json()) as {
        items: AuditLogRow[];
        total: number;
      };
      setRows(body.items ?? []);
      setTotal(body.total ?? 0);
    }
    setLoading(false);
  }, [token, entityType, entityId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className={SECONDARY_BUTTON_CLASS}
          disabled={loading}
        >
          {t("common.refresh")}
        </button>
        {total > 0 && (
          <span className="text-sm text-[#7F8C8D]">
            {t("securityAuditPage.paginationShort", {
              page,
              maxPage,
              total,
            })}
          </span>
        )}
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {loading && <p className="text-sm text-[#7F8C8D]">{t("common.loading")}</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-[#7F8C8D]">{t("securityAuditPage.entityHistoryEmpty")}</p>
      )}
      {rows.length > 0 && (
        <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
          <table className="min-w-full text-[13px]">
            <thead className="bg-gray-50 text-left text-[#7F8C8D]">
              <tr>
                <th className="px-3 py-2 font-medium">{t("securityAuditPage.colWhen")}</th>
                <th className="px-3 py-2 font-medium">{t("securityAuditPage.colWho")}</th>
                <th className="px-3 py-2 font-medium">{t("securityAuditPage.colAction")}</th>
                <th className="px-3 py-2 font-medium">{t("securityAuditPage.colDiff")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sem = semanticFromHttp(r.action);
                return (
                  <tr key={r.id} className="border-t border-[#D5DADF]">
                    <td className="px-3 py-2 whitespace-nowrap text-[#34495E]">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-[#34495E]">
                      {actorLabel(r.user ?? undefined, r.userId)}
                    </td>
                    <td className="px-3 py-2">
                      <AuditActionChip semanticAction={sem} httpAction={r.action} />
                    </td>
                    <td className="px-3 py-2">
                      {sem === "UPDATE" ? (
                        <button
                          type="button"
                          onClick={() => setSelected(r)}
                          className="text-[#2980B9] hover:underline font-medium"
                        >
                          {t("securityAuditPage.viewDiff")}
                        </button>
                      ) : (
                        <span className="text-[#7F8C8D]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > pageSize && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={`${SECONDARY_BUTTON_CLASS} disabled:opacity-40 text-xs px-3 py-1`}
          >
            {t("employees.prevPage")}
          </button>
          <button
            type="button"
            disabled={page >= maxPage}
            onClick={() => setPage((p) => p + 1)}
            className={`${SECONDARY_BUTTON_CLASS} disabled:opacity-40 text-xs px-3 py-1`}
          >
            {t("employees.nextPage")}
          </button>
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
