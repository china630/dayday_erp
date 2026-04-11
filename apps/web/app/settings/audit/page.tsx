"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useRequireAuth } from "../../../lib/use-require-auth";

type AuditRow = {
  id: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
  oldValues: unknown;
  newValues: unknown;
  changes: unknown;
  hash: string | null;
  clientIp: string | null;
  userAgent: string | null;
  user?: { id: string; email: string } | null;
};

export default function AuditSettingsPage() {
  const { t } = useTranslation();
  const { ready, token } = useRequireAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");

  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [integrity, setIntegrity] = useState<{
    total: number;
    legacyWithoutHash: number;
    invalidCount: number;
    invalidIds: string[];
  } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoadErr(null);
    setBusy(true);
    try {
      const q = new URLSearchParams();
      q.set("take", "100");
      if (userId.trim()) q.set("userId", userId.trim());
      if (from.trim()) q.set("from", new Date(from).toISOString());
      if (to.trim()) q.set("to", new Date(to).toISOString());
      if (entityType.trim()) q.set("entityType", entityType.trim());
      if (action.trim()) q.set("action", action.trim());
      const res = await apiFetch(`/api/audit/logs?${q.toString()}`);
      if (!res.ok) {
        setLoadErr(String(res.status));
        return;
      }
      setRows((await res.json()) as AuditRow[]);
    } finally {
      setBusy(false);
    }
  }, [token, userId, from, to, entityType, action]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
    // initial load only; filters apply via button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  async function runIntegrity() {
    setIntegrity(null);
    const res = await apiFetch("/api/audit/integrity-check", { method: "POST" });
    if (!res.ok) {
      setLoadErr(String(res.status));
      return;
    }
    setIntegrity(
      (await res.json()) as {
        total: number;
        legacyWithoutHash: number;
        invalidCount: number;
        invalidIds: string[];
      },
    );
  }

  if (!ready || !token) {
    return <div className="text-sm text-gray-500">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t("auditPage.title")}</h1>
        <p className="text-gray-600 mt-2">{t("auditPage.subtitle")}</p>
      </div>

      <section className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
        <h2 className="text-[13px] font-semibold text-[#34495E]">{t("auditPage.filters")}</h2>
        <div className="flex flex-wrap gap-3 items-end text-[13px]">
          <label className="text-[#34495E]">
            {t("auditPage.filterUser")}
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="UUID"
              className={`block mt-1 w-64 ${INPUT_BORDERED_CLASS}`}
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
          <label className="text-[#34495E]">
            {t("auditPage.filterEntity")}
            <input
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="Invoice, Product…"
              className={`block mt-1 w-40 ${INPUT_BORDERED_CLASS}`}
            />
          </label>
          <label className="text-[#34495E]">
            {t("auditPage.filterAction")}
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="POST, PATCH…"
              className={`block mt-1 w-28 ${INPUT_BORDERED_CLASS}`}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {t("auditPage.apply")}
          </button>
          <button
            type="button"
            onClick={() => void runIntegrity()}
            className={SECONDARY_BUTTON_CLASS}
          >
            {t("auditPage.integrity")}
          </button>
        </div>
        {integrity && (
          <p className="text-sm text-gray-700">
            {t("auditPage.integrityResult", {
              total: integrity.total,
              legacy: integrity.legacyWithoutHash,
              invalid: integrity.invalidCount,
            })}
          </p>
        )}
      </section>

      {loadErr && <p className="text-red-600 text-sm">{loadErr}</p>}

      <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
        <table className="min-w-full text-[13px]">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">{t("auditPage.colTime")}</th>
              <th className="px-3 py-2 font-medium">{t("auditPage.colUser")}</th>
              <th className="px-3 py-2 font-medium">{t("auditPage.colEntity")}</th>
              <th className="px-3 py-2 font-medium">{t("auditPage.colAction")}</th>
              <th className="px-3 py-2 font-medium">{t("auditPage.colHash")}</th>
              <th className="px-3 py-2 font-medium">{t("auditPage.colDiff")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 max-w-[140px] truncate" title={r.user?.email ?? r.userId ?? ""}>
                  {r.user?.email ?? r.userId ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium">{r.entityType}</span>
                  <span className="text-gray-500 text-xs ml-1 break-all">{r.entityId}</span>
                </td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.hash ? `${r.hash.slice(0, 12)}…` : "—"}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="font-medium text-[#2980B9] hover:text-[#34495E] hover:underline"
                  >
                    {t("auditPage.viewDiff")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal
        >
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <h3 className="font-semibold">{t("auditPage.diffTitle")}</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto grid md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-medium text-gray-700 mb-2">{t("auditPage.before")}</div>
                <pre className="bg-slate-50 border rounded p-3 overflow-auto max-h-[60vh] whitespace-pre-wrap">
                  {formatJson(selected.oldValues)}
                </pre>
              </div>
              <div>
                <div className="font-medium text-gray-700 mb-2">{t("auditPage.after")}</div>
                <pre className="bg-slate-50 border rounded p-3 overflow-auto max-h-[60vh] whitespace-pre-wrap">
                  {formatJson(selected.newValues)}
                </pre>
              </div>
            </div>
            <div className="px-4 py-2 border-t text-xs text-gray-500">
              IP: {selected.clientIp ?? "—"} · {selected.userAgent ?? "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatJson(v: unknown): string {
  if (v === null || v === undefined) {
    return "—";
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
