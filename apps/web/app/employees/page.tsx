"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { formatMoneyAzn } from "../../lib/format-money";
import { inputFieldClass } from "../../lib/form-classes";
import { isValidFinCode } from "../../lib/fin-code";
import { useAuth } from "../../lib/auth-context";
import { isRestrictedUserRole } from "../../lib/role-utils";
import { useRequireAuth } from "../../lib/use-require-auth";
import { useSubscription } from "../../lib/subscription-context";
import { ModulePageLinks } from "../../components/module-page-links";
import { EmptyState } from "../../components/empty-state";
import { parseHrEmployeesResponse } from "../../lib/hr-employees-list";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { EmployeeModal } from "./employee-modal";

function sanitizeFinInput(raw: string): string {
  return raw.replace(/[^0-9A-HJ-NP-Za-hj-np-z]/g, "").slice(0, 7);
}

type Employee = {
  id: string;
  kind?: string;
  finCode: string;
  voen?: string | null;
  firstName: string;
  lastName: string;
  positionId: string;
  jobPosition?: {
    id: string;
    name: string;
    department: { id: string; name: string };
  };
  startDate: string;
  salary: unknown;
  contractorMonthlySocialAzn?: unknown | null;
};

type JobPositionOpt = {
  id: string;
  name: string;
  department: { id: string; name: string };
};

const lbl =
  "block text-xs font-bold text-[#7F8C8D] uppercase tracking-wide mb-1.5";

export default function EmployeesPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const hideDestructive = isRestrictedUserRole(user?.role ?? undefined);
  const { ready: subReady, effectiveSnapshot: snapshot } = useSubscription();
  const [createOpen, setCreateOpen] = useState(false);
  const [rows, setRows] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editSalary, setEditSalary] = useState("");
  const [editKind, setEditKind] = useState<"EMPLOYEE" | "CONTRACTOR">("EMPLOYEE");
  const [editVoen, setEditVoen] = useState("");
  const [editContractorSocial, setEditContractorSocial] = useState("");
  const [positions, setPositions] = useState<JobPositionOpt[]>([]);
  const [editPositionId, setEditPositionId] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [res, pres] = await Promise.all([
      apiFetch(`/api/hr/employees?page=${page}&pageSize=${pageSize}`),
      apiFetch("/api/hr/job-positions"),
    ]);
    if (!res.ok) {
      setError(`${t("employees.loadErr")}: ${res.status}`);
      setRows([]);
      setTotal(0);
    } else {
      const parsed = parseHrEmployeesResponse<Employee>(await res.json());
      setRows(parsed.items);
      setTotal(parsed.total);
    }
    if (pres.ok) {
      setPositions((await pres.json()) as JobPositionOpt[]);
    }
    setLoading(false);
  }, [token, t, page]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editing) return;
    if (
      !editing.firstName.trim() ||
      !editing.lastName.trim() ||
      !String(editing.startDate).slice(0, 10) ||
      editSalary === ""
    ) {
      alert(t("employees.fillRequired"));
      return;
    }
    if (!isValidFinCode(editing.finCode)) {
      alert(t("employees.finInvalidStrict"));
      return;
    }
    if (editKind === "CONTRACTOR" && !/^\d{10}$/.test(editVoen.trim())) {
      alert(t("counterparties.taxInvalid"));
      return;
    }
    if (!editPositionId) {
      alert(t("employees.fillRequired"));
      return;
    }
    const patch: Record<string, unknown> = {
      kind: editKind,
      finCode: editing.finCode.trim(),
      firstName: editing.firstName,
      lastName: editing.lastName,
      positionId: editPositionId,
      startDate: String(editing.startDate).slice(0, 10),
      salary: Number(editSalary),
    };
    if (editKind === "CONTRACTOR") {
      patch.voen = editVoen.trim();
      patch.contractorMonthlySocialAzn =
        editContractorSocial === "" ? null : Number(editContractorSocial);
    } else {
      patch.voen = null;
      patch.contractorMonthlySocialAzn = null;
    }
    setEditSaving(true);
    try {
      const res = await apiFetch(`/api/hr/employees/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const raw = await res.text();
        try {
          const j = JSON.parse(raw) as { code?: string; message?: unknown };
          if (j.code === "QUOTA_EXCEEDED") {
            if (res.status === 402) return;
            const msg =
              typeof j.message === "string"
                ? j.message
                : Array.isArray(j.message)
                  ? j.message.join(" ")
                  : j.message &&
                      typeof j.message === "object" &&
                      "ru" in (j.message as object)
                    ? String((j.message as { ru?: string }).ru)
                    : t("employees.quotaExceeded");
            alert(msg);
            return;
          }
        } catch {
          /* not JSON */
        }
        if (raw.trim()) alert(raw);
        return;
      }
      setEditing(null);
      setEditVoen("");
      setEditContractorSocial("");
      await load();
    } finally {
      setEditSaving(false);
    }
  }

  async function remove(id: string) {
    if (!token || !window.confirm(t("employees.confirmDelete"))) return;
    const res = await apiFetch(`/api/hr/employees/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    await load();
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
    <div className="space-y-8">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/payroll", labelKey: "nav.payroll" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#34495E]">{t("employees.title")}</h1>
        </div>
        <button
          type="button"
          className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          disabled={subReady && Boolean(snapshot?.quotas.employees.atLimit)}
          title={
            subReady && snapshot?.quotas.employees.atLimit
              ? t("subscription.employeesLimitTooltip")
              : undefined
          }
          onClick={() => setCreateOpen(true)}
        >
          + {t("employees.newBtn")}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            {t("employees.paginationSummary", {
              from: total === 0 ? 0 : (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, total),
              total,
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={`${SECONDARY_BUTTON_CLASS} px-3 py-1 text-xs disabled:opacity-40`}
            >
              {t("employees.prevPage")}
            </button>
            <span className="tabular-nums">
              {page} / {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <button
              type="button"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
              className={`${SECONDARY_BUTTON_CLASS} px-3 py-1 text-xs disabled:opacity-40`}
            >
              {t("employees.nextPage")}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <section className={`${CARD_CONTAINER_CLASS} p-6 max-w-lg border-[#2980B9]/25`}>
          <h2 className="text-lg font-semibold text-[#34495E] mb-4">{t("employees.editSection")}</h2>
          <form noValidate onSubmit={(e) => void submitEdit(e)} className="grid gap-4">
            <div>
              <span className={lbl}>{t("employees.kind")}</span>
              <select
                value={editKind}
                onChange={(e) =>
                  setEditKind(e.target.value as "EMPLOYEE" | "CONTRACTOR")
                }
                className={inputFieldClass}
              >
                <option value="EMPLOYEE">{t("employees.kindEmployee")}</option>
                <option value="CONTRACTOR">{t("employees.kindContractor")}</option>
              </select>
            </div>
            <div>
              <span className={lbl}>{t("employees.fin")}</span>
              <input
                value={editing.finCode}
                maxLength={7}
                onChange={(e) =>
                  setEditing({ ...editing, finCode: sanitizeFinInput(e.target.value) })
                }
                className={inputFieldClass}
              />
            </div>
            {editKind === "CONTRACTOR" && (
              <>
                <div>
                  <span className={lbl}>{t("employees.voen")}</span>
                  <input
                    value={editVoen}
                    maxLength={10}
                    onChange={(e) => setEditVoen(e.target.value.replace(/\D/g, ""))}
                    className={inputFieldClass}
                  />
                </div>
                <div>
                  <span className={lbl}>{t("employees.contractorSocial")}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editContractorSocial}
                    onChange={(e) => setEditContractorSocial(e.target.value)}
                    className={inputFieldClass}
                  />
                </div>
              </>
            )}
            <div>
              <span className={lbl}>{t("employees.firstName")}</span>
              <input
                value={editing.firstName}
                onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
                className={inputFieldClass}
              />
            </div>
            <div>
              <span className={lbl}>{t("employees.lastName")}</span>
              <input
                value={editing.lastName}
                onChange={(e) => setEditing({ ...editing, lastName: e.target.value })}
                className={inputFieldClass}
              />
            </div>
            <div>
              <span className={lbl}>{t("employees.jobPositionSelect")}</span>
              <select
                value={editPositionId}
                onChange={(e) => setEditPositionId(e.target.value)}
                className={inputFieldClass}
              >
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.department.name} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={lbl}>{t("employees.startDate")}</span>
              <input
                type="date"
                value={String(editing.startDate).slice(0, 10)}
                onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                className={inputFieldClass}
              />
            </div>
            <div>
              <span className={lbl}>{t("employees.gross")}</span>
              <input
                type="number"
                step="0.01"
                value={editSalary}
                onChange={(e) => setEditSalary(e.target.value)}
                className={inputFieldClass}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={editSaving}
                className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium disabled:opacity-50 min-w-[8rem]"
              >
                {editSaving ? "…" : t("employees.save")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setEditSalary("");
                  setEditVoen("");
                  setEditContractorSocial("");
                }}
                className="border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                {t("employees.cancel")}
              </button>
            </div>
          </form>
        </section>
      )}

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && rows.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm text-sm space-y-1"
              >
                <div className="font-medium text-gray-900">
                  {r.lastName} {r.firstName}
                </div>
                <div className="text-xs text-slate-600">
                  {t("employees.thFin")}: {r.finCode} ·{" "}
                  {r.kind === "CONTRACTOR"
                    ? t("employees.kindContractor")
                    : t("employees.kindEmployee")}
                </div>
                {r.voen && (
                  <div className="text-xs">
                    {t("employees.thVoen")}: {r.voen}
                  </div>
                )}
                <div>
                  {t("employees.thGross")}: {formatMoneyAzn(r.salary)}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-md border border-slate-200"
                    onClick={() => {
                      setEditing(r);
                      setEditPositionId(r.positionId);
                      setEditKind((r.kind ?? "EMPLOYEE") as "EMPLOYEE" | "CONTRACTOR");
                      setEditVoen((r.voen ?? "").replace(/\D/g, ""));
                      setEditContractorSocial(
                        r.contractorMonthlySocialAzn != null &&
                          typeof r.contractorMonthlySocialAzn === "object" &&
                          r.contractorMonthlySocialAzn !== null &&
                          "toString" in r.contractorMonthlySocialAzn
                          ? (r.contractorMonthlySocialAzn as { toString(): string }).toString()
                          : r.contractorMonthlySocialAzn != null
                            ? String(r.contractorMonthlySocialAzn)
                            : "",
                      );
                      setEditSalary(
                        typeof r.salary === "object" && r.salary !== null && "toString" in r.salary
                          ? (r.salary as { toString(): string }).toString()
                          : String(r.salary),
                      );
                    }}
                  >
                    {t("employees.change")}
                  </button>
                  {!hideDestructive && (
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-700"
                      onClick={() => void remove(r.id)}
                    >
                      {t("employees.remove")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="text-sm min-w-[720px]">
              <thead>
                <tr>
                  <th>{t("employees.thFin")}</th>
                  <th>{t("employees.thKind")}</th>
                  <th className="hidden lg:table-cell">{t("employees.thVoen")}</th>
                  <th>{t("employees.thName")}</th>
                  <th className="hidden xl:table-cell">{t("employees.thPosition")}</th>
                  <th className="hidden lg:table-cell">{t("employees.thStart")}</th>
                  <th>{t("employees.thGross")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.finCode}</td>
                    <td>
                      {r.kind === "CONTRACTOR"
                        ? t("employees.kindContractor")
                        : t("employees.kindEmployee")}
                    </td>
                    <td className="hidden lg:table-cell">{r.voen ?? "—"}</td>
                    <td>
                      {r.lastName} {r.firstName}
                    </td>
                    <td className="hidden xl:table-cell">
                      {r.jobPosition
                        ? `${r.jobPosition.department.name} — ${r.jobPosition.name}`
                        : "—"}
                    </td>
                    <td className="hidden lg:table-cell">
                      {String(r.startDate).slice(0, 10)}
                    </td>
                    <td>{formatMoneyAzn(r.salary)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-sm px-2 py-1 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10"
                          onClick={() => {
                            setEditing(r);
                            setEditPositionId(r.positionId);
                            setEditKind((r.kind ?? "EMPLOYEE") as "EMPLOYEE" | "CONTRACTOR");
                            setEditVoen((r.voen ?? "").replace(/\D/g, ""));
                            setEditContractorSocial(
                              r.contractorMonthlySocialAzn != null &&
                                typeof r.contractorMonthlySocialAzn === "object" &&
                                r.contractorMonthlySocialAzn !== null &&
                                "toString" in r.contractorMonthlySocialAzn
                                ? (r.contractorMonthlySocialAzn as { toString(): string }).toString()
                                : r.contractorMonthlySocialAzn != null
                                  ? String(r.contractorMonthlySocialAzn)
                                  : "",
                            );
                            setEditSalary(
                              typeof r.salary === "object" && r.salary !== null && "toString" in r.salary
                                ? (r.salary as { toString(): string }).toString()
                                : String(r.salary),
                            );
                          }}
                        >
                          {t("employees.change")}
                        </button>
                        {!hideDestructive && (
                          <button
                            type="button"
                            className="text-sm px-2 py-1 rounded-md border border-slate-200 text-red-700 hover:bg-red-50"
                            onClick={() => void remove(r.id)}
                          >
                            {t("employees.remove")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!loading && rows.length === 0 && !error && (
        <EmptyState
          title={t("employees.none")}
          description={t("employees.emptyHint")}
          action={
            <button
              type="button"
              className="inline-flex items-center justify-center bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              disabled={subReady && Boolean(snapshot?.quotas.employees.atLimit)}
              onClick={() => setCreateOpen(true)}
            >
              + {t("employees.newTitle")}
            </button>
          }
        />
      )}

      <EmployeeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void load()}
        quotaAtLimit={subReady && Boolean(snapshot?.quotas.employees.atLimit)}
      />
    </div>
  );
}
