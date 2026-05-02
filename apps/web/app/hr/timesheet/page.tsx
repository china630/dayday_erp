"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import {
  CARD_CONTAINER_CLASS,
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CENTER_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TH_CENTER_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useAuth } from "../../../lib/auth-context";
import { isRestrictedUserRole } from "../../../lib/role-utils";

type Ts = {
  id: string;
  year: number;
  month: number;
  status: "DRAFT" | "APPROVED";
};

type EmpRow = { id: string; firstName: string; lastName: string; finCode: string };

type TsEntry = {
  id: string;
  employeeId: string;
  dayDate: string;
  type: "WORK" | "VACATION" | "SICK" | "OFF" | "BUSINESS_TRIP";
  hours: unknown;
  lockedFromAbsence: boolean;
};

const ENTRY_ORDER: TsEntry["type"][] = [
  "WORK",
  "VACATION",
  "SICK",
  "OFF",
  "BUSINESS_TRIP",
];

function isoDay(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function HrTimesheetPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const readOnlyRole = isRestrictedUserRole(user?.role ?? undefined);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [timesheet, setTimesheet] = useState<Ts | null>(null);
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [entries, setEntries] = useState<TsEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [batchEmp, setBatchEmp] = useState("");
  const [batchFrom, setBatchFrom] = useState(1);
  const [batchTo, setBatchTo] = useState(1);
  const [batchType, setBatchType] = useState<TsEntry["type"]>("VACATION");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const lastDay = useMemo(
    () => new Date(year, month, 0).getDate(),
    [year, month],
  );

  const entryMap = useMemo(() => {
    const m = new Map<string, TsEntry>();
    for (const e of entries) {
      const d = String(e.dayDate).slice(0, 10);
      m.set(`${e.employeeId}|${d}`, e);
    }
    return m;
  }, [entries]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch(`/api/hr/timesheets?year=${year}&month=${month}`);
    if (!res.ok) {
      setError(`${t("timesheet.loadErr")}: ${res.status}`);
      setTimesheet(null);
      setEmployees([]);
      setEntries([]);
    } else {
      const j = (await res.json()) as {
        timesheet: Ts | null;
        employees: EmpRow[];
        entries: TsEntry[];
      };
      if (!j.timesheet) {
        setTimesheet(null);
        setEmployees([]);
        setEntries([]);
      } else {
        setTimesheet(j.timesheet);
        setEmployees(j.employees);
        setEntries(j.entries);
        setSelectedEmployeeIds((prev) => prev.filter((id) => j.employees.some((e) => e.id === id)));
        setBatchEmp((prev) =>
          prev && j.employees.some((e) => e.id === prev) ? prev : j.employees[0]?.id ?? "",
        );
      }
    }
    setLoading(false);
  }, [token, year, month, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    setBatchFrom(1);
    setBatchTo(lastDay);
  }, [year, month, lastDay]);

  const isLocked = timesheet?.status === "APPROVED";
  const canEdit = !readOnlyRole && !isLocked;
  const canMassApprove = canEdit && selectedEmployeeIds.length > 0;

  function cellCode(type: TsEntry["type"]): string {
    switch (type) {
      case "WORK":
        return t("timesheet.codeWork");
      case "VACATION":
        return t("timesheet.codeVacation");
      case "SICK":
        return t("timesheet.codeSick");
      case "OFF":
        return t("timesheet.codeOff");
      case "BUSINESS_TRIP":
        return t("timesheet.codeTrip");
      default:
        return "?";
    }
  }

  async function runAutofill() {
    if (!token || !timesheet || !canEdit) return;
    setBusy(true);
    const res = await apiFetch(`/api/hr/timesheets/${timesheet.id}/autofill`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const j = await res.json();
    setEntries(j.entries);
    setTimesheet(j.timesheet);
  }

  async function runSyncAbsences() {
    if (!token || !timesheet || !canEdit) return;
    setBusy(true);
    const res = await apiFetch(`/api/hr/timesheets/${timesheet.id}/sync-absences`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const j = await res.json();
    setEntries(j.entries);
    setTimesheet(j.timesheet);
  }

  async function runApprove() {
    if (!token || !timesheet || !canEdit) return;
    if (!window.confirm(t("timesheet.confirmApprove"))) return;
    setBusy(true);
    const res = await apiFetch(`/api/hr/timesheets/${timesheet.id}/approve`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const j = await res.json();
    setTimesheet(j.timesheet);
  }

  async function runMassApprove() {
    if (!token || !timesheet || !canMassApprove) return;
    setBusy(true);
    const res = await apiFetch(`/api/hr/timesheets/${timesheet.id}/approve-mass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeIds: selectedEmployeeIds }),
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    alert(t("timesheet.massApproveOk"));
  }

  async function runBatch() {
    if (!token || !timesheet || !canEdit || !batchEmp) return;
    if (batchFrom > batchTo) {
      alert(t("timesheet.batchRangeErr"));
      return;
    }
    setBusy(true);
    const res = await apiFetch(`/api/hr/timesheets/${timesheet.id}/entries/batch`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batches: [
          {
            employeeId: batchEmp,
            fromDay: batchFrom,
            toDay: batchTo,
            type: batchType,
          },
        ],
      }),
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const j = await res.json();
    setEntries(j.entries);
    setTimesheet(j.timesheet);
  }

  async function setCellType(employeeId: string, day: number, type: TsEntry["type"]) {
    if (!token || !timesheet || !canEdit) return;
    const res = await apiFetch(`/api/hr/timesheets/${timesheet.id}/entries/batch`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batches: [{ employeeId, fromDay: day, toDay: day, type }],
      }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    const j = await res.json();
    setEntries(j.entries);
    setTimesheet(j.timesheet);
  }

  function cycleCell(employeeId: string, day: number, current?: TsEntry) {
    if (!canEdit || current?.lockedFromAbsence) return;
    const cur = current?.type ?? "OFF";
    const idx = ENTRY_ORDER.indexOf(cur);
    const next = ENTRY_ORDER[(idx + 1) % ENTRY_ORDER.length];
    void setCellType(employeeId, day, next);
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
    <div className="space-y-6 max-w-[100vw]">
      <PageHeader
        title={t("hrTimesheet.title")}
        subtitle={t("timesheet.subtitle")}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              {t("payroll.year")}
              <input
                type="number"
                className={`w-24 ${INPUT_BORDERED_CLASS} py-1.5`}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              {t("payroll.month")}
              <input
                type="number"
                min={1}
                max={12}
                className={`w-20 ${INPUT_BORDERED_CLASS} py-1.5`}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              {t("timesheet.status")}
              <span className="font-medium text-gray-900">
                {timesheet
                  ? timesheet.status === "APPROVED"
                    ? t("timesheet.statusApproved")
                    : t("timesheet.statusDraft")
                  : "—"}
              </span>
            </label>
          </div>
        }
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

      {!loading && timesheet && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !canEdit}
              onClick={() => void runAutofill()}
              className={PRIMARY_BUTTON_CLASS}
            >
              {t("timesheet.autofill")}
            </button>
            <button
              type="button"
              disabled={busy || !canEdit}
              onClick={() => void runSyncAbsences()}
              className={SECONDARY_BUTTON_CLASS}
            >
              {t("timesheet.syncAbsences")}
            </button>
            <button
              type="button"
              disabled={busy || !canEdit}
              onClick={() => void runApprove()}
              className={PRIMARY_BUTTON_CLASS}
            >
              {t("timesheet.confirmBtn")}
            </button>
            <button
              type="button"
              disabled={busy || !canMassApprove}
              onClick={() => void runMassApprove()}
              className={SECONDARY_BUTTON_CLASS}
            >
              {t("timesheet.massApproveBtn", { defaultValue: "Массово утвердить" })}
            </button>
            <Link href="/payroll" className={SECONDARY_BUTTON_CLASS}>
              {t("hrTimesheet.newAbsence")}
            </Link>
          </div>

          <section className={`${CARD_CONTAINER_CLASS} p-4`}>
            <h2 className="mb-3 text-base font-semibold text-[#34495E]">{t("timesheet.batchTitle")}</h2>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="block">
                <span className="text-slate-600">{t("timesheet.batchEmployee")}</span>
                <select
                  className={`mt-1 block min-w-[200px] ${INPUT_BORDERED_CLASS} py-1.5`}
                  value={batchEmp}
                  onChange={(e) => setBatchEmp(e.target.value)}
                  disabled={!canEdit}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName} {e.firstName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600">{t("timesheet.batchFrom")}</span>
                <input
                  type="number"
                  min={1}
                  max={lastDay}
                  className={`mt-1 block w-20 ${INPUT_BORDERED_CLASS} py-1.5`}
                  value={batchFrom}
                  onChange={(e) => setBatchFrom(Number(e.target.value))}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="text-slate-600">{t("timesheet.batchTo")}</span>
                <input
                  type="number"
                  min={1}
                  max={lastDay}
                  className={`mt-1 block w-20 ${INPUT_BORDERED_CLASS} py-1.5`}
                  value={batchTo}
                  onChange={(e) => setBatchTo(Number(e.target.value))}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="text-slate-600">{t("timesheet.batchType")}</span>
                <select
                  className={`mt-1 block ${INPUT_BORDERED_CLASS} py-1.5`}
                  value={batchType}
                  onChange={(e) => setBatchType(e.target.value as TsEntry["type"])}
                  disabled={!canEdit}
                >
                  <option value="WORK">{t("timesheet.typeWork")}</option>
                  <option value="VACATION">{t("timesheet.typeVacation")}</option>
                  <option value="SICK">{t("timesheet.typeSick")}</option>
                  <option value="OFF">{t("timesheet.typeOff")}</option>
                  <option value="BUSINESS_TRIP">{t("timesheet.typeTrip")}</option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !canEdit || !batchEmp}
                onClick={() => void runBatch()}
                className={PRIMARY_BUTTON_CLASS}
              >
                {t("timesheet.batchApply")}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">{t("timesheet.legendHint")}</p>
          </section>

          <div className={DATA_TABLE_VIEWPORT_CLASS}>
            <table className={`${DATA_TABLE_CLASS} min-w-max border-collapse`}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th
                    className={`sticky left-0 z-20 min-w-[140px] border-r border-[#D5DADF] ${DATA_TABLE_TH_LEFT_CLASS} bg-[#F8FAFC]`}
                  >
                    {t("employees.thName")}
                  </th>
                  {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => {
                    const dt = new Date(year, month - 1, d);
                    const wd = dt.getDay();
                    const wdl = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][wd];
                    return (
                      <th
                        key={d}
                        className={`min-w-[36px] border-l border-[#D5DADF] ${DATA_TABLE_TH_CENTER_CLASS} bg-[#F8FAFC] py-1 text-[11px]`}
                      >
                        <div className="text-[10px] font-normal text-[#7F8C8D]">{wdl}</div>
                        {d}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className={`${DATA_TABLE_TR_CLASS} group`}>
                    <td
                      className={`sticky left-0 z-10 border-r border-[#D5DADF] ${DATA_TABLE_TD_CLASS} bg-white font-semibold text-[#34495E] whitespace-nowrap group-hover:bg-[#F1F5F9]`}
                    >
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedEmployeeIds.includes(emp.id)}
                          disabled={!canEdit}
                          onChange={(e) => {
                            setSelectedEmployeeIds((prev) =>
                              e.target.checked
                                ? [...prev, emp.id]
                                : prev.filter((id) => id !== emp.id),
                            );
                          }}
                        />
                        <span>
                          {emp.lastName} {emp.firstName}
                        </span>
                      </label>
                    </td>
                    {Array.from({ length: lastDay }, (_, i) => i + 1).map((d) => {
                      const key = isoDay(year, month, d);
                      const e = entryMap.get(`${emp.id}|${key}`);
                      const locked = e?.lockedFromAbsence;
                      const typ = e?.type ?? "OFF";
                      return (
                        <td
                          key={d}
                          className={`${DATA_TABLE_TD_CENTER_CLASS} border-l border-[#D5DADF] p-0`}
                        >
                          <button
                            type="button"
                            title={locked ? t("timesheet.absenceLocked") : cellCode(typ)}
                            disabled={!canEdit || Boolean(locked)}
                            onClick={() => cycleCell(emp.id, d, e)}
                            className={`w-full min-h-[32px] px-0.5 py-1 font-bold leading-none ${
                              locked
                                ? "bg-amber-50 text-amber-900 cursor-not-allowed"
                                : canEdit
                                  ? "hover:bg-action/10 cursor-pointer"
                                  : "cursor-default"
                            }`}
                          >
                            {cellCode(typ)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <span>
              <strong>{t("timesheet.termSalahiyyat")}</strong> — {t("timesheet.termSalahiyyatDesc")}
            </span>
            <span>
              <strong>{t("timesheet.termMezuniyyat")}</strong> — {t("timesheet.termMezuniyyatDesc")}
            </span>
            <span>
              <strong>{t("timesheet.termEzamiyyat")}</strong> — {t("timesheet.termEzamiyyatDesc")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
