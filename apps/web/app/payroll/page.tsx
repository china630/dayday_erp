"use client";

import { useAuth } from "../../lib/auth-context";
import { isRestrictedUserRole } from "../../lib/role-utils";
import { ModulePageLinks } from "../../components/module-page-links";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { parseHrEmployeesResponse } from "../../lib/hr-employees-list";
import { formatMoneyAzn } from "../../lib/format-money";
import { useRequireAuth } from "../../lib/use-require-auth";
import { EmptyState } from "../../components/empty-state";
import { DepartmentSelect } from "../../components/payroll/department-select";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { VacationCalcModal } from "../../components/payroll/vacation-calc-modal";
import { SickCalcModal } from "../../components/payroll/sick-calc-modal";
import { PayrollRunModal } from "../../components/payroll/payroll-run-modal";
import { AbsenceModal } from "../../components/payroll/absence-modal";
import {
  EmployeeAbsencesModal,
  type EmployeeAbsenceRow,
} from "../../components/payroll/employee-absences-modal";
import { Filter, Users } from "lucide-react";

type RunRow = {
  id: string;
  year: number;
  month: number;
  status: string;
  _count: { slips: number };
};

type EmpOpt = { id: string; firstName: string; lastName: string };

type AbsenceTypeOpt = { id: string; nameAz: string; code: string; formula: string };

type AbsenceRow = {
  id: string;
  startDate: string;
  endDate: string;
  note: string;
  employee: EmpOpt;
  absenceType?: { id: string; nameAz: string; code: string; formula: string };
};

function decPositive(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function parseIsoDateValueUtc(s: string): number | null {
  const x = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
  const y = Number(x.slice(0, 4));
  const m = Number(x.slice(5, 7)) - 1;
  const d = Number(x.slice(8, 10));
  const t = Date.UTC(y, m, d, 12, 0, 0, 0);
  return Number.isFinite(t) ? t : null;
}

function parseMonthValue(v: string): { year: number; month: number } | null {
  const s = v.trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function monthValueFromYm(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function monthBoundsUtc(year: number, month: number): { startT: number; endT: number } {
  const startT = Date.UTC(year, month - 1, 1, 12, 0, 0, 0);
  const endT = Date.UTC(year, month, 0, 12, 0, 0, 0);
  return { startT, endT };
}

function parseIsoDayUtcT(s: string): number {
  const x = s.slice(0, 10);
  return Date.UTC(
    Number(x.slice(0, 4)),
    Number(x.slice(5, 7)) - 1,
    Number(x.slice(8, 10)),
    12,
    0,
    0,
    0,
  );
}

function overlapsMonth(a: AbsenceRow, year: number, month: number): boolean {
  const { startT, endT } = monthBoundsUtc(year, month);
  const a0 = parseIsoDayUtcT(a.startDate);
  const a1 = parseIsoDayUtcT(a.endDate);
  return a1 >= startT && a0 <= endT;
}

function formatMoneyNoSymbol(v: unknown): string {
  return formatMoneyAzn(v).replace("₼", "").trim();
}

function PayrollPageInner() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const hideDestructive = isRestrictedUserRole(user?.role ?? undefined);

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<unknown>(null);

  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [absLoading, setAbsLoading] = useState(false);
  const [absErr, setAbsErr] = useState<string | null>(null);

  const [calcEmp, setCalcEmp] = useState("");
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceTypeOpt[]>([]);
  const [vacModalOpen, setVacModalOpen] = useState(false);
  const [sickModalOpen, setSickModalOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);

  const [monthValue, setMonthValue] = useState(() =>
    monthValueFromYm(new Date().getFullYear(), new Date().getMonth() + 1),
  );
  const [departmentId, setDepartmentId] = useState("");

  const [employeeAbsencesOpen, setEmployeeAbsencesOpen] = useState(false);
  const [employeeAbsencesEmp, setEmployeeAbsencesEmp] = useState<EmpOpt | null>(null);

  const [payrollJob, setPayrollJob] = useState<{
    jobId: string;
    state: string;
  } | null>(null);
  const pollAbortRef = useRef(false);
  const [createRunLoading, setCreateRunLoading] = useState(false);
  const [importTimesheet, setImportTimesheet] = useState(false);
  const [approvedTimesheetId, setApprovedTimesheetId] = useState<string | null>(null);
  const [postingRunId, setPostingRunId] = useState<string | null>(null);
  const [deletingAbsenceId, setDeletingAbsenceId] = useState<string | null>(null);
  const payrollBusy = payrollJob !== null;

  useEffect(() => {
    const parsed = parseMonthValue(monthValue);
    if (!parsed) return;
    setYear(parsed.year);
    setMonth(parsed.month);
  }, [monthValue]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const r = await apiFetch(
        `/api/hr/timesheets?year=${year}&month=${month}&create=false`,
      );
      if (!r.ok) {
        setApprovedTimesheetId(null);
        return;
      }
      const j = (await r.json()) as {
        timesheet: { id: string; status: string } | null;
      };
      const ts = j.timesheet;
      if (ts && ts.status === "APPROVED") {
        setApprovedTimesheetId(ts.id);
      } else {
        setApprovedTimesheetId(null);
        setImportTimesheet(false);
      }
    })();
  }, [token, year, month]);

  const load = useCallback(async () => {
    if (!token) {
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/hr/payroll/runs");
    if (!res.ok) {
      setError(`${t("payroll.loadErr")}: ${res.status}`);
      setRuns([]);
    } else {
      setRuns(await res.json());
    }
    setLoading(false);
  }, [token, t]);

  const loadAbsencesBlock = useCallback(async () => {
    if (!token) {
      setAbsences([]);
      setEmployees([]);
      return;
    }
    setAbsLoading(true);
    setAbsErr(null);
    const [er, ea, et] = await Promise.all([
      apiFetch("/api/hr/employees?page=1&pageSize=500"),
      apiFetch("/api/hr/absences"),
      apiFetch("/api/hr/absence-types"),
    ]);
    if (!er.ok) setAbsErr(`${t("employees.loadErr")}: ${er.status}`);
    else {
      const parsed = parseHrEmployeesResponse<EmpOpt>(await er.json());
      setEmployees(parsed.items);
    }
    if (!ea.ok) setAbsErr(`${t("payroll.loadErr")}: ${ea.status}`);
    else setAbsences(await ea.json());
    if (et.ok) {
      const types = (await et.json()) as AbsenceTypeOpt[];
      setAbsenceTypes(types);
    }
    setAbsLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadAbsencesBlock();
  }, [loadAbsencesBlock, ready, token]);

  useEffect(() => {
    if (employees.length === 0) return;
    setCalcEmp((prev) =>
      prev && employees.some((e) => e.id === prev) ? prev : employees[0].id,
    );
  }, [employees]);

  useEffect(() => {
    return () => {
      pollAbortRef.current = true;
    };
  }, []);

  const pollPayrollJob = useCallback(
    async (jobId: string, opts?: { refreshRunId?: string }) => {
      pollAbortRef.current = false;
      const intervalMs = 900;
      const maxMs = 15 * 60 * 1000;
      const start = Date.now();
      while (!pollAbortRef.current && Date.now() - start < maxMs) {
        const res = await apiFetch(`/api/hr/payroll/jobs/${jobId}`);
        if (!res.ok) {
          setPayrollJob(null);
          alert(await res.text());
          return;
        }
        const s = (await res.json()) as {
          state: string;
          failedReason?: string;
        };
        setPayrollJob({ jobId, state: s.state });
        if (s.state === "completed") {
          setPayrollJob(null);
          await load();
          const rid = opts?.refreshRunId;
          if (rid) {
            const r = await apiFetch(`/api/hr/payroll/runs/${rid}`);
            if (r.ok) setDetail(await r.json());
          }
          return;
        }
        if (s.state === "failed") {
          setPayrollJob(null);
          alert(s.failedReason ?? "Job failed");
          return;
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      if (!pollAbortRef.current) {
        setPayrollJob(null);
        alert(t("payroll.jobTimeout"));
      }
    },
    [load, t],
  );

  async function createRun(override?: {
    year?: number;
    month?: number;
    importTimesheet?: boolean;
  }) {
    if (!token || createRunLoading || payrollBusy) return;
    setCreateRunLoading(true);
    const y = override?.year ?? year;
    const m = override?.month ?? month;
    const imp = override?.importTimesheet ?? importTimesheet;
    const body: Record<string, unknown> = { year: y, month: m };
    if (imp && approvedTimesheetId) {
      body.timesheetId = approvedTimesheetId;
    }
    const res = await apiFetch("/api/hr/payroll/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    if (!res.ok) {
      alert(raw);
      setCreateRunLoading(false);
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      await load();
      setCreateRunLoading(false);
      return;
    }
    if (
      data &&
      typeof data === "object" &&
      "async" in data &&
      (data as { async?: boolean }).async === true &&
      "jobId" in data
    ) {
      const jobId = String((data as { jobId: string }).jobId);
      setPayrollJob({ jobId, state: "waiting" });
      setCreateRunLoading(false);
      void pollPayrollJob(jobId);
      return;
    }
    await load();
    setCreateRunLoading(false);
  }

  async function postRun(id: string) {
    if (!token || payrollBusy || postingRunId !== null) return;
    setPostingRunId(id);
    const res = await apiFetch(`/api/hr/payroll/runs/${id}/post`, {
      method: "POST",
    });
    const raw = await res.text();
    if (!res.ok) {
      alert(raw);
      setPostingRunId(null);
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      await load();
      if (detailId === id) {
        const r = await apiFetch(`/api/hr/payroll/runs/${id}`);
        if (r.ok) setDetail(await r.json());
      }
      setPostingRunId(null);
      return;
    }
    if (
      data &&
      typeof data === "object" &&
      "async" in data &&
      (data as { async?: boolean }).async === true &&
      "jobId" in data
    ) {
      const jobId = String((data as { jobId: string }).jobId);
      setPayrollJob({ jobId, state: "waiting" });
      setPostingRunId(null);
      void pollPayrollJob(jobId, { refreshRunId: id });
      return;
    }
    await load();
    if (detailId === id) {
      const r = await apiFetch(`/api/hr/payroll/runs/${id}`);
      if (r.ok) setDetail(await r.json());
    }
    setPostingRunId(null);
  }

  async function openDetail(id: string) {
    if (!token) return;
    setDetailId(id);
    const r = await apiFetch(`/api/hr/payroll/runs/${id}`);
    setDetail(r.ok ? await r.json() : null);
  }

  async function removeAbsence(id: string) {
    if (!token || deletingAbsenceId !== null || !window.confirm("OK?")) return;
    setDeletingAbsenceId(id);
    const res = await apiFetch(`/api/hr/absences/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert(await res.text());
      setDeletingAbsenceId(null);
      return;
    }
    await loadAbsencesBlock();
    setDeletingAbsenceId(null);
  }

  type Slip = {
    id: string;
    employee: EmpOpt & { kind?: string; departmentId?: string | null };
    gross: unknown;
    incomeTax: unknown;
    dsmfWorker: unknown;
    dsmfEmployer: unknown;
    itsWorker: unknown;
    itsEmployer: unknown;
    unemploymentWorker: unknown;
    unemploymentEmployer: unknown;
    contractorSocialWithheld?: unknown;
    net: unknown;
    timesheetWorkDays?: number | null;
    timesheetVacationDays?: number | null;
    timesheetSickDays?: number | null;
    timesheetBusinessTripDays?: number | null;
  };

  const slips =
    detail &&
    typeof detail === "object" &&
    "slips" in detail &&
    Array.isArray((detail as { slips: unknown[] }).slips)
      ? (detail as { slips: Slip[] }).slips
      : [];

  const slipsFiltered = useMemo(() => {
    if (!departmentId) return slips;
    return slips.filter((s) => String(s.employee.departmentId ?? "") === departmentId);
  }, [slips, departmentId]);

  const showContractorCol = slips.some(
    (s) =>
      s.employee.kind === "CONTRACTOR" || decPositive(s.contractorSocialWithheld),
  );

  const showTimesheetCols = slips.some(
    (s) =>
      s.timesheetWorkDays != null ||
      s.timesheetVacationDays != null ||
      s.timesheetSickDays != null ||
      s.timesheetBusinessTripDays != null,
  );

  const currentRun = useMemo(() => {
    return runs.find((r) => r.year === year && r.month === month) ?? null;
  }, [runs, year, month]);

  useEffect(() => {
    if (!currentRun) {
      setDetailId(null);
      setDetail(null);
      return;
    }
    if (detailId === currentRun.id) return;
    void openDetail(currentRun.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRun]);

  const absencesInMonth = useMemo(() => {
    return absences.filter((a) => overlapsMonth(a, year, month));
  }, [absences, year, month]);

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
          { href: "/employees", labelKey: "nav.employees" },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setAbsenceModalOpen(true)}
            disabled={employees.length === 0 || absenceTypes.length === 0}
          >
            Yeni qeyd
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setVacModalOpen(true)}
            disabled={employees.length === 0}
          >
            {t("payroll.vacationCalc")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setSickModalOpen(true)}
            disabled={employees.length === 0}
          >
            {t("payroll.sickCalcTitle")}
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => setRunModalOpen(true)}
            disabled={payrollBusy}
          >
            Yeni hesab
          </button>
        </div>
        <div className="flex items-start gap-4">
          <h1 className="text-xl font-semibold text-[#34495E]">
            Məzuniyyət və Əmək haqqı
          </h1>
        </div>
      </div>

      {payrollJob && (
        <div className={`${CARD_CONTAINER_CLASS} border-l-4 border-l-[#2980B9] p-4`}>
          <p className="text-[13px] font-semibold text-[#34495E]">{t("payroll.jobBusy")}</p>
          <p className="mt-1 text-xs text-[#7F8C8D]">{t("payroll.jobBusyHint")}</p>
          <p className="mt-2 text-xs tabular-nums text-[#34495E]">
            {t("payroll.jobState", { state: payrollJob.state })}
          </p>
          <div
            className="mt-3 h-2 rounded-full bg-action/15 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("payroll.jobBusy")}
          >
            <div className="h-full w-2/5 rounded-full bg-action animate-pulse" />
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2">
            <Users className="h-5 w-5 text-[#7F8C8D]" aria-hidden />
            {t("payroll.slipsTitle")}
          </h2>
          <div className="flex flex-wrap items-end justify-end gap-4">
            <Filter className="h-4 w-4 text-[#7F8C8D]" aria-hidden />
            <label className="block text-[13px] font-medium text-[#34495E]">
              Ay
              <input
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                className="mt-1 block h-8 rounded-[2px] border border-[#D5DADF] bg-white px-2 text-[13px]"
              />
            </label>
            <DepartmentSelect
              value={departmentId}
              onChange={setDepartmentId}
              className="mt-1 block h-8 rounded-[2px] border border-[#D5DADF] bg-white px-2 text-[13px] min-w-[220px]"
            />
          </div>
          {currentRun ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#34495E] bg-[#EBEDF0] px-2 py-1 rounded-[2px] border border-[#D5DADF]">
                {currentRun.status}
              </span>
              {currentRun.status === "DRAFT" ? (
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={payrollBusy || postingRunId === currentRun.id}
                  onClick={() => void postRun(currentRun.id)}
                >
                  {postingRunId === currentRun.id ? "…" : t("payroll.post")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!detailId ? (
          <EmptyState title={t("payroll.emptyRuns")} description={t("payroll.emptyRunsHint")} />
        ) : slipsFiltered.length === 0 ? (
          <div className={`${CARD_CONTAINER_CLASS} p-4 text-sm text-slate-600`}>
            {departmentId ? "No employees in this department." : t("payroll.emptyRunsHint")}
          </div>
        ) : (
          <>
              <div className="md:hidden space-y-3">
                {slipsFiltered.map((s) => (
                  <div
                    key={s.id}
                    className={`${CARD_CONTAINER_CLASS} space-y-1.5 p-4 text-sm`}
                  >
                    <div className="font-semibold text-gray-900">
                      {s.employee.lastName} {s.employee.firstName}
                    </div>
                    <div className="text-slate-600">
                      {t("employees.thKind")}:{" "}
                      {s.employee.kind === "CONTRACTOR"
                        ? t("employees.kindContractor")
                        : t("employees.kindEmployee")}
                    </div>
                    <div>
                      {t("employees.thGross")}: {formatMoneyNoSymbol(s.gross)}
                    </div>
                    <div>
                      {t("payroll.thPit")}: {formatMoneyNoSymbol(s.incomeTax)}
                    </div>
                    {showContractorCol && (
                      <div>
                        {t("payroll.thContractorSoc")}:{" "}
                        {formatMoneyNoSymbol(s.contractorSocialWithheld ?? 0)}
                      </div>
                    )}
                    <div>
                      {t("payroll.thDsmfW")} / {t("payroll.thDsmfE")}:{" "}
                      {formatMoneyNoSymbol(s.dsmfWorker)} / {formatMoneyNoSymbol(s.dsmfEmployer)}
                    </div>
                    <div>
                      {t("payroll.thItsW")} / {t("payroll.thItsE")}:{" "}
                      {formatMoneyNoSymbol(s.itsWorker)} / {formatMoneyNoSymbol(s.itsEmployer)}
                    </div>
                    <div>
                      {t("payroll.thUnempW")} / {t("payroll.thUnempE")}:{" "}
                      {formatMoneyNoSymbol(s.unemploymentWorker)} / {formatMoneyNoSymbol(s.unemploymentEmployer)}
                    </div>
                    {showTimesheetCols && (
                      <div className="text-xs text-slate-600 pt-1 border-t border-dashed border-slate-200">
                        {t("payroll.thTsWork")}: {s.timesheetWorkDays ?? "—"} · {t("payroll.thTsVac")}:{" "}
                        {s.timesheetVacationDays ?? "—"} · {t("payroll.thTsSick")}: {s.timesheetSickDays ?? "—"}{" "}
                        · {t("payroll.thTsTrip")}: {s.timesheetBusinessTripDays ?? "—"}
                      </div>
                    )}
                    <div className="font-medium text-primary pt-1 border-t border-slate-100">
                      {t("payroll.thNet")}: {formatMoneyNoSymbol(s.net)}
                    </div>
                  </div>
                ))}
              </div>
              <div className={`hidden md:block overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
                <table className="text-sm min-w-full">
                  <thead>
                    <tr className="border-b border-[#D5DADF]">
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]" rowSpan={3}>
                        {t("payroll.thEmployee")}
                      </th>
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]" rowSpan={3}>
                        {t("employees.thKind")}
                      </th>
                      {showTimesheetCols ? (
                        <th
                          className="p-2 text-center text-[12px] font-semibold text-[#34495E] border-l border-[#D5DADF]"
                          colSpan={4}
                        >
                          Tabel (gün)
                        </th>
                      ) : null}
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]" rowSpan={3}>
                        {t("employees.thGross")} (₼)
                      </th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]" rowSpan={3}>
                        {t("payroll.thPit")} (₼)
                      </th>
                      {showContractorCol && (
                        <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]" rowSpan={3}>
                          {t("payroll.thContractorSoc")} (₼)
                        </th>
                      )}
                      <th
                        className="p-2 text-center text-[12px] font-semibold text-[#34495E] border-l border-[#D5DADF]"
                        colSpan={3}
                      >
                        İşçi (₼)
                      </th>
                      <th
                        className="p-2 text-center text-[12px] font-semibold text-[#34495E] border-l border-[#D5DADF]"
                        colSpan={3}
                      >
                        İşəgötürən (₼)
                      </th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] border-l border-[#D5DADF]" rowSpan={3}>
                        {t("payroll.thNet")} (₼)
                      </th>
                    </tr>
                    <tr className="border-b border-[#D5DADF]">
                      {showTimesheetCols ? (
                        <>
                          <th className="p-1 text-center text-[12px] font-semibold text-[#34495E] w-10 min-w-10 border-l border-[#D5DADF]">
                            W
                          </th>
                          <th className="p-1 text-center text-[12px] font-semibold text-[#34495E] w-10 min-w-10">
                            M
                          </th>
                          <th className="p-1 text-center text-[12px] font-semibold text-[#34495E] w-10 min-w-10">
                            X
                          </th>
                          <th className="p-1 text-center text-[12px] font-semibold text-[#34495E] w-10 min-w-10 border-r border-[#D5DADF]">
                            E
                          </th>
                        </>
                      ) : null}
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] border-l border-[#D5DADF]">
                        DSMF
                      </th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">
                        İTS
                      </th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] border-r border-[#D5DADF]">
                        İŞS
                      </th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] border-l border-[#D5DADF]">
                        DSMF
                      </th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">
                        İTS
                      </th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] border-r border-[#D5DADF]">
                        İŞS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {slipsFiltered.map((s) => (
                      <tr key={s.id} className="border-t border-[#EBEDF0]">
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-action hover:text-primary hover:underline text-left"
                            onClick={() => {
                              setEmployeeAbsencesEmp({
                                id: s.employee.id,
                                firstName: s.employee.firstName,
                                lastName: s.employee.lastName,
                              });
                              setEmployeeAbsencesOpen(true);
                            }}
                          >
                            {s.employee.lastName} {s.employee.firstName}
                          </button>
                        </td>
                        <td className="p-2">
                          {s.employee.kind === "CONTRACTOR"
                            ? t("employees.kindContractor")
                            : t("employees.kindEmployee")}
                        </td>
                        {showTimesheetCols && (
                          <>
                            <td className="p-1 text-center tabular-nums w-10 min-w-10">{s.timesheetWorkDays ?? "—"}</td>
                            <td className="p-1 text-center tabular-nums w-10 min-w-10">{s.timesheetVacationDays ?? "—"}</td>
                            <td className="p-1 text-center tabular-nums w-10 min-w-10">{s.timesheetSickDays ?? "—"}</td>
                            <td className="p-1 text-center tabular-nums w-10 min-w-10 border-r border-[#D5DADF]">{s.timesheetBusinessTripDays ?? "—"}</td>
                          </>
                        )}
                        <td className="p-2 text-right font-mono">{formatMoneyNoSymbol(s.gross)}</td>
                        <td className="p-2 text-right font-mono">{formatMoneyNoSymbol(s.incomeTax)}</td>
                        {showContractorCol && (
                          <td className="p-2 text-right font-mono">
                            {formatMoneyNoSymbol(s.contractorSocialWithheld ?? 0)}
                          </td>
                        )}
                        <td className="p-2 text-right font-mono border-l border-[#D5DADF]">
                          {formatMoneyNoSymbol(s.dsmfWorker)}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {formatMoneyNoSymbol(s.itsWorker)}
                        </td>
                        <td className="p-2 text-right font-mono border-r border-[#D5DADF]">
                          {formatMoneyNoSymbol(s.unemploymentWorker)}
                        </td>
                        <td className="p-2 text-right font-mono border-l border-[#D5DADF]">
                          {formatMoneyNoSymbol(s.dsmfEmployer)}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {formatMoneyNoSymbol(s.itsEmployer)}
                        </td>
                        <td className="p-2 text-right font-mono border-r border-[#D5DADF]">
                          {formatMoneyNoSymbol(s.unemploymentEmployer)}
                        </td>
                        <td className="p-2 text-right font-mono font-medium border-l border-[#D5DADF]">
                          {formatMoneyNoSymbol(s.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {loading && <p className="text-gray-600">{t("common.loading")}</p>}
        {!loading && !error && !currentRun && (
          <EmptyState title={t("payroll.emptyRuns")} description={t("payroll.emptyRunsHint")} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[#34495E]">{t("payroll.tabAbsences")}</h2>
        {absErr && <p className="text-red-600 text-sm">{absErr}</p>}
        {absLoading && <p className="text-gray-600">{t("common.loading")}</p>}
        {!absLoading && absencesInMonth.length === 0 ? (
          <div className={`${CARD_CONTAINER_CLASS} p-4 text-sm text-slate-600`}>
            —
          </div>
        ) : (
          <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
            <table className="text-sm min-w-full">
              <thead>
                <tr className="border-b border-[#D5DADF]">
                  <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                    {t("payroll.absenceThEmployee")}
                  </th>
                  <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                    {t("payroll.absenceThType")}
                  </th>
                  <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                    {t("payroll.absenceThPeriod")}
                  </th>
                  <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                    {t("payroll.absenceNote")}
                  </th>
                  {!hideDestructive ? (
                    <th className="p-2 text-[13px] font-semibold text-[#34495E]" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {absencesInMonth.map((a) => (
                  <tr key={a.id} className="border-t border-[#EBEDF0]">
                    <td className="p-2">
                      {a.employee.lastName} {a.employee.firstName}
                    </td>
                    <td className="p-2">
                      {a.absenceType?.nameAz ?? t("payroll.absenceTypeUnknown")}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {String(a.startDate).slice(0, 10)} —{" "}
                      {String(a.endDate).slice(0, 10)}
                    </td>
                    <td className="p-2">{a.note || "—"}</td>
                    {!hideDestructive ? (
                      <td className="p-2">
                        <button
                          type="button"
                          className="text-red-700 text-xs border border-red-200 px-2 py-1 rounded-md hover:bg-red-50 disabled:opacity-60"
                          disabled={deletingAbsenceId !== null}
                          onClick={() => void removeAbsence(a.id)}
                        >
                          {deletingAbsenceId === a.id ? "…" : t("payroll.absenceDelete")}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <VacationCalcModal
        open={vacModalOpen}
        onClose={() => setVacModalOpen(false)}
        employees={employees}
        absenceTypes={absenceTypes}
        defaultEmployeeId={calcEmp}
      />
      <SickCalcModal
        open={sickModalOpen}
        onClose={() => setSickModalOpen(false)}
        employees={employees}
        defaultEmployeeId={calcEmp}
      />
      <PayrollRunModal
        open={runModalOpen}
        onClose={() => setRunModalOpen(false)}
        busy={createRunLoading || payrollBusy}
        defaultYear={year}
        defaultMonth={month}
        timesheetApprovedAvailable={Boolean(approvedTimesheetId)}
        onCreate={({ year: y, month: m, importTimesheet: it }) => {
          setYear(y);
          setMonth(m);
          setImportTimesheet(Boolean(it));
          void createRun({
            year: y,
            month: m,
            importTimesheet: Boolean(it),
          }).then(() => setRunModalOpen(false));
        }}
      />
      <AbsenceModal
        open={absenceModalOpen}
        onClose={() => setAbsenceModalOpen(false)}
        employees={employees}
        types={absenceTypes}
        defaultEmployeeId={calcEmp}
        onSaved={() => {
          void loadAbsencesBlock();
        }}
      />

      <EmployeeAbsencesModal
        open={employeeAbsencesOpen}
        onClose={() => setEmployeeAbsencesOpen(false)}
        employeeId={employeeAbsencesEmp?.id ?? null}
        employeeLabel={
          employeeAbsencesEmp
            ? `${employeeAbsencesEmp.lastName} ${employeeAbsencesEmp.firstName}`
            : undefined
        }
        year={year}
        month={month}
      />
    </div>
  );
}

export default function PayrollPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="text-gray-600">
          <p>{t("common.loading")}</p>
        </div>
      }
    >
      <PayrollPageInner />
    </Suspense>
  );
}
