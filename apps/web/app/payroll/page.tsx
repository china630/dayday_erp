"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { isRestrictedUserRole } from "../../lib/role-utils";
import { ModulePageLinks } from "../../components/module-page-links";
import {
  Suspense,
  useCallback,
  useEffect,
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
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

type RunRow = {
  id: string;
  year: number;
  month: number;
  status: string;
  _count: { slips: number };
};

type EmpOpt = { id: string; firstName: string; lastName: string };

type AbsenceRow = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  note: string;
  employee: EmpOpt;
};

function decPositive(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function utcDayKey(y: number, m0: number, d: number): number {
  return Date.UTC(y, m0, d);
}

function parseIsoDayUtc(s: string): number {
  const x = s.slice(0, 10);
  return Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
}

function absenceCellKinds(
  absences: AbsenceRow[],
  y: number,
  m0: number,
  d: number,
): { vacation: boolean; sick: boolean } {
  const day = utcDayKey(y, m0, d);
  let vacation = false;
  let sick = false;
  for (const a of absences) {
    const a0 = parseIsoDayUtc(a.startDate);
    const a1 = parseIsoDayUtc(a.endDate);
    if (day < a0 || day > a1) continue;
    if (a.type === "VACATION") vacation = true;
    if (a.type === "SICK_LEAVE") sick = true;
  }
  return { vacation, sick };
}

function PayrollPageInner() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const hideDestructive = isRestrictedUserRole(user?.role ?? undefined);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"runs" | "absences">("runs");

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
  const [calcFrom, setCalcFrom] = useState("");
  const [calcTo, setCalcTo] = useState("");
  const [calcOut, setCalcOut] = useState<Record<string, string> | null>(null);

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
  const [calcSubmitting, setCalcSubmitting] = useState(false);
  const payrollBusy = payrollJob !== null;

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (!token || tab !== "runs") return;
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
  }, [token, tab, year, month]);

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
    const [er, ea] = await Promise.all([
      apiFetch("/api/hr/employees?page=1&pageSize=500"),
      apiFetch("/api/hr/absences"),
    ]);
    if (!er.ok) setAbsErr(`${t("employees.loadErr")}: ${er.status}`);
    else {
      const parsed = parseHrEmployeesResponse<EmpOpt>(await er.json());
      setEmployees(parsed.items);
    }
    if (!ea.ok) setAbsErr(`${t("payroll.loadErr")}: ${ea.status}`);
    else setAbsences(await ea.json());
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
    const tabParam = searchParams.get("tab");
    if (tabParam === "absences") setTab("absences");
  }, [searchParams]);

  useEffect(() => {
    if (tab !== "absences" || employees.length === 0) return;
    setCalcEmp((prev) =>
      prev && employees.some((e) => e.id === prev) ? prev : employees[0].id,
    );
  }, [tab, employees]);

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

  async function createRun() {
    if (!token || createRunLoading || payrollBusy) return;
    setCreateRunLoading(true);
    const body: Record<string, unknown> = { year, month };
    if (importTimesheet && approvedTimesheetId) {
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

  async function runVacationCalc(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !calcEmp || !calcFrom || !calcTo || calcSubmitting) return;
    setCalcOut(null);
    setCalcSubmitting(true);
    const res = await apiFetch("/api/hr/absences/vacation-pay/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: calcEmp,
        vacationStart: calcFrom,
        vacationEnd: calcTo,
      }),
    });
    if (!res.ok) {
      alert(await res.text());
      setCalcSubmitting(false);
      return;
    }
    setCalcOut(await res.json());
    setCalcSubmitting(false);
  }

  type Slip = {
    id: string;
    employee: EmpOpt & { kind?: string };
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

  const tabBtn =
    "inline-flex h-8 min-h-8 items-center justify-center rounded-[2px] border px-4 text-[13px] font-semibold transition-colors";
  const tabActive = "border-[#2980B9] bg-[#2980B9] text-white shadow-sm hover:bg-[#2471A3]";
  const tabIdle =
    "border-[#D5DADF] bg-white text-[#34495E] hover:bg-[#F4F5F7] hover:border-[#B8C0C8]";

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
      <div>
        <h1 className="text-xl font-semibold text-[#34495E]">{t("payroll.title")}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            type="button"
            className={`${tabBtn} ${tab === "runs" ? tabActive : tabIdle}`}
            onClick={() => setTab("runs")}
          >
            {t("payroll.tabRuns")}
          </button>
          <button
            type="button"
            className={`${tabBtn} ${tab === "absences" ? tabActive : tabIdle}`}
            onClick={() => setTab("absences")}
          >
            {t("payroll.tabAbsences")}
          </button>
          {tab === "absences" && (
            <Link href="/payroll/absences/new" className={`${PRIMARY_BUTTON_CLASS} ml-auto`}>
              + {t("payroll.newAbsenceBtn")}
            </Link>
          )}
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

      <section className={`${CARD_CONTAINER_CLASS} p-4`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[#34495E]">{t("payroll.calendarTitle")}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => {
                if (calMonth <= 1) {
                  setCalMonth(12);
                  setCalYear((y) => y - 1);
                } else setCalMonth((m) => m - 1);
              }}
            >
              {t("payroll.calendarPrev")}
            </button>
            <span className="min-w-[8rem] text-center text-[13px] font-medium tabular-nums text-[#34495E]">
              {calMonth}.{calYear}
            </span>
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => {
                if (calMonth >= 12) {
                  setCalMonth(1);
                  setCalYear((y) => y + 1);
                } else setCalMonth((m) => m + 1);
              }}
            >
              {t("payroll.calendarNext")}
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs text-[#7F8C8D]">{t("payroll.calendarHint")}</p>
        {absLoading && absences.length === 0 ? (
          <p className="text-sm text-slate-500">{t("common.loading")}</p>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 mb-1">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const m0 = calMonth - 1;
                const first = new Date(Date.UTC(calYear, m0, 1));
                const dow = first.getUTCDay();
                const mondayStart = (dow + 6) % 7;
                const daysInMonth = new Date(Date.UTC(calYear, calMonth, 0)).getUTCDate();
                const cells: ReactElement[] = [];
                for (let i = 0; i < mondayStart; i++) {
                  cells.push(<div key={`e-${i}`} className="aspect-square" />);
                }
                for (let d = 1; d <= daysInMonth; d++) {
                  const { vacation, sick } = absenceCellKinds(absences, calYear, m0, d);
                  let bg = "bg-slate-50";
                  if (vacation && sick) bg = "bg-gradient-to-br from-blue-200 to-yellow-200";
                  else if (vacation) bg = "bg-blue-200";
                  else if (sick) bg = "bg-yellow-200";
                  const labels = absences
                    .filter((a) => {
                      const day = utcDayKey(calYear, m0, d);
                      const a0 = parseIsoDayUtc(a.startDate);
                      const a1 = parseIsoDayUtc(a.endDate);
                      return day >= a0 && day <= a1;
                    })
                    .map((a) => `${a.employee.lastName} ${a.employee.firstName?.[0] ?? ""}.`);
                  cells.push(
                    <div
                      key={d}
                      title={labels.length ? labels.join(", ") : undefined}
                      className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs font-medium text-slate-800 border border-slate-100 ${bg}`}
                    >
                      {d}
                    </div>,
                  );
                }
                return cells;
              })()}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-blue-200 border border-slate-200" />
                {t("payroll.calendarLegendVacation")}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-yellow-200 border border-slate-200" />
                {t("payroll.calendarLegendSick")}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-gradient-to-br from-blue-200 to-yellow-200 border border-slate-200" />
                {t("payroll.calendarLegendVacation")} + {t("payroll.calendarLegendSick")}
              </span>
            </div>
          </>
        )}
      </section>

      {tab === "runs" && (
        <>
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <section className={`${CARD_CONTAINER_CLASS} p-6`}>
            <h2 className="mb-4 text-base font-semibold text-[#34495E]">{t("payroll.newRun")}</h2>
            <div className="flex flex-wrap items-end gap-4">
              <label className="block text-[13px] font-medium text-[#34495E]">
                {t("payroll.year")}
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className={`mt-1 block w-28 ${INPUT_BORDERED_CLASS} py-1.5`}
                />
              </label>
              <label className="block text-[13px] font-medium text-[#34495E]">
                {t("payroll.month")}
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className={`mt-1 block w-24 ${INPUT_BORDERED_CLASS} py-1.5`}
                />
              </label>
              <button
                type="button"
                onClick={() => void createRun()}
                disabled={createRunLoading || payrollBusy}
                className={PRIMARY_BUTTON_CLASS}
              >
                {createRunLoading ? "…" : t("payroll.createDraft")}
              </button>
            </div>
            {approvedTimesheetId && (
              <label className="mt-4 flex items-start gap-2 text-sm text-slate-700 cursor-pointer max-w-xl">
                <input
                  type="checkbox"
                  checked={importTimesheet}
                  onChange={(e) => setImportTimesheet(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{t("payroll.importTimesheet")}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">
                    {t("payroll.importTimesheetHint")}
                  </span>
                </span>
              </label>
            )}
          </section>

          {loading && <p className="text-gray-600">{t("common.loading")}</p>}
          {!loading && !error && runs.length === 0 && (
            <EmptyState
              title={t("payroll.emptyRuns")}
              description={t("payroll.emptyRunsHint")}
            />
          )}
          {!loading && runs.length > 0 && (
            <>
              <div className="md:hidden space-y-3">
                {runs.map((r) => (
                  <div
                    key={r.id}
                    className={`${CARD_CONTAINER_CLASS} space-y-2 p-4 text-sm`}
                  >
                    <div className="font-semibold text-gray-900">
                      {t("payroll.thPeriod")}: {r.month}.{r.year}
                    </div>
                    <div>
                      {t("payroll.thStatus")}: {r.status}
                    </div>
                    <div>
                      {t("payroll.thSlips")}: {r._count.slips}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        className="text-sm px-3 py-1.5 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10"
                        onClick={() => void openDetail(r.id)}
                      >
                        {t("payroll.details")}
                      </button>
                      {r.status === "DRAFT" && (
                        <button
                          type="button"
                          className="text-sm px-3 py-1.5 rounded-md bg-action text-white hover:bg-action-hover disabled:opacity-60"
                          disabled={payrollBusy || postingRunId === r.id}
                          onClick={() => void postRun(r.id)}
                        >
                          {postingRunId === r.id ? "…" : t("payroll.post")}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className={`hidden md:block overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
                <table className="text-sm min-w-full">
                  <thead>
                    <tr className="border-b border-[#D5DADF]">
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                        {t("payroll.thPeriod")}
                      </th>
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                        {t("payroll.thStatus")}
                      </th>
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                        {t("payroll.thSlips")}
                      </th>
                      <th className="p-2 text-[13px] font-semibold text-[#34495E]" />
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-t border-[#EBEDF0]">
                        <td className="p-2">
                          {r.month}.{r.year}
                        </td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2">{r._count.slips}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-sm px-2 py-1 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10"
                              onClick={() => void openDetail(r.id)}
                            >
                              {t("payroll.details")}
                            </button>
                            {r.status === "DRAFT" && (
                              <button
                                type="button"
                                className="text-sm px-2 py-1 rounded-md bg-action text-white hover:bg-action-hover disabled:opacity-60"
                                disabled={payrollBusy || postingRunId === r.id}
                                onClick={() => void postRun(r.id)}
                              >
                                {postingRunId === r.id ? "…" : t("payroll.post")}
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

          {detailId && slips.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">{t("payroll.slipsTitle")}</h2>
              <div className="md:hidden space-y-3">
                {slips.map((s) => (
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
                      {t("employees.thGross")}: {formatMoneyAzn(s.gross)}
                    </div>
                    <div>
                      {t("payroll.thPit")}: {formatMoneyAzn(s.incomeTax)}
                    </div>
                    {showContractorCol && (
                      <div>
                        {t("payroll.thContractorSoc")}:{" "}
                        {formatMoneyAzn(s.contractorSocialWithheld ?? 0)}
                      </div>
                    )}
                    <div>
                      {t("payroll.thDsmfW")} / {t("payroll.thDsmfE")}:{" "}
                      {formatMoneyAzn(s.dsmfWorker)} / {formatMoneyAzn(s.dsmfEmployer)}
                    </div>
                    <div>
                      {t("payroll.thItsW")} / {t("payroll.thItsE")}:{" "}
                      {formatMoneyAzn(s.itsWorker)} / {formatMoneyAzn(s.itsEmployer)}
                    </div>
                    <div>
                      {t("payroll.thUnempW")} / {t("payroll.thUnempE")}:{" "}
                      {formatMoneyAzn(s.unemploymentWorker)} / {formatMoneyAzn(s.unemploymentEmployer)}
                    </div>
                    {showTimesheetCols && (
                      <div className="text-xs text-slate-600 pt-1 border-t border-dashed border-slate-200">
                        {t("payroll.thTsWork")}: {s.timesheetWorkDays ?? "—"} · {t("payroll.thTsVac")}:{" "}
                        {s.timesheetVacationDays ?? "—"} · {t("payroll.thTsSick")}: {s.timesheetSickDays ?? "—"}{" "}
                        · {t("payroll.thTsTrip")}: {s.timesheetBusinessTripDays ?? "—"}
                      </div>
                    )}
                    <div className="font-medium text-primary pt-1 border-t border-slate-100">
                      {t("payroll.thNet")}: {formatMoneyAzn(s.net)}
                    </div>
                  </div>
                ))}
              </div>
              <div className={`hidden md:block overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
                <table className="text-sm min-w-full">
                  <thead>
                    <tr className="border-b border-[#D5DADF]">
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">{t("payroll.thEmployee")}</th>
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">{t("employees.thKind")}</th>
                      {showTimesheetCols && (
                        <>
                          <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thTsWork")}</th>
                          <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thTsVac")}</th>
                          <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thTsSick")}</th>
                          <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thTsTrip")}</th>
                        </>
                      )}
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("employees.thGross")}</th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thPit")}</th>
                      {showContractorCol && (
                        <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thContractorSoc")}</th>
                      )}
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thDsmfW")}</th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thDsmfE")}</th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thItsW")}</th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thItsE")}</th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thUnempW")}</th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thUnempE")}</th>
                      <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">{t("payroll.thNet")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slips.map((s) => (
                      <tr key={s.id} className="border-t border-[#EBEDF0]">
                        <td className="p-2">
                          {s.employee.lastName} {s.employee.firstName}
                        </td>
                        <td className="p-2">
                          {s.employee.kind === "CONTRACTOR"
                            ? t("employees.kindContractor")
                            : t("employees.kindEmployee")}
                        </td>
                        {showTimesheetCols && (
                          <>
                            <td className="p-2 text-right tabular-nums">{s.timesheetWorkDays ?? "—"}</td>
                            <td className="p-2 text-right tabular-nums">{s.timesheetVacationDays ?? "—"}</td>
                            <td className="p-2 text-right tabular-nums">{s.timesheetSickDays ?? "—"}</td>
                            <td className="p-2 text-right tabular-nums">{s.timesheetBusinessTripDays ?? "—"}</td>
                          </>
                        )}
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.gross)}</td>
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.incomeTax)}</td>
                        {showContractorCol && (
                          <td className="p-2 text-right font-mono">
                            {formatMoneyAzn(s.contractorSocialWithheld ?? 0)}
                          </td>
                        )}
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.dsmfWorker)}</td>
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.dsmfEmployer)}</td>
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.itsWorker)}</td>
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.itsEmployer)}</td>
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.unemploymentWorker)}</td>
                        <td className="p-2 text-right font-mono">{formatMoneyAzn(s.unemploymentEmployer)}</td>
                        <td className="p-2 text-right font-mono font-medium">{formatMoneyAzn(s.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {tab === "absences" && (
        <div className="space-y-8">
          {absErr && <p className="text-red-600 text-sm">{absErr}</p>}
          {absLoading && <p className="text-gray-600">{t("common.loading")}</p>}

          <section className={`${CARD_CONTAINER_CLASS} p-6`}>
            <h2 className="mb-2 text-base font-semibold text-[#34495E]">{t("payroll.vacationCalc")}</h2>
            <p className="mb-4 text-[13px] text-[#7F8C8D]">{t("payroll.vacationCalcHint")}</p>
            <form onSubmit={(e) => void runVacationCalc(e)} className="grid gap-3 max-w-md">
              <label className="block text-sm font-medium text-gray-700">
                {t("payroll.pickEmployee")}
                <select
                  className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
                  value={calcEmp}
                  onChange={(e) => setCalcEmp(e.target.value)}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName} {e.firstName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                {t("payroll.absenceFrom")}
                <input
                  type="date"
                  className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
                  value={calcFrom}
                  onChange={(e) => setCalcFrom(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                {t("payroll.absenceTo")}
                <input
                  type="date"
                  className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
                  value={calcTo}
                  onChange={(e) => setCalcTo(e.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={calcSubmitting}
                className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium w-fit disabled:opacity-60"
              >
                {calcSubmitting ? "…" : t("payroll.calcBtn")}
              </button>
            </form>
            {calcOut && (
              <div className="mt-4 p-4 rounded-lg bg-slate-50 text-sm space-y-1">
                <div className="font-semibold text-gray-900">{t("payroll.calcResult")}</div>
                <div>
                  {formatMoneyAzn(calcOut.vacationPayAmount)} AZN ({calcOut.calendarDays}{" "}
                  {t("payroll.absenceThPeriod").toLowerCase()})
                </div>
                <div className="text-slate-600 text-xs">
                  Ø мес.: {calcOut.averageMonthlyGross} · Ø день: {calcOut.averageDailyGross} · мес. в
                  базе: {calcOut.monthsInAverage}
                </div>
              </div>
            )}
          </section>

          {!absLoading && absences.length > 0 && (
            <>
              <div className="md:hidden space-y-3">
                {absences.map((a) => (
                  <div
                    key={a.id}
                    className={`${CARD_CONTAINER_CLASS} space-y-1 p-4 text-sm`}
                  >
                    <div className="font-medium text-gray-900">
                      {a.employee.lastName} {a.employee.firstName}
                    </div>
                    <div>
                      {t("payroll.absenceThType")}:{" "}
                      {a.type === "VACATION"
                        ? t("payroll.absenceVacation")
                        : t("payroll.absenceSick")}
                    </div>
                    <div>
                      {t("payroll.absenceThPeriod")}: {String(a.startDate).slice(0, 10)} —{" "}
                      {String(a.endDate).slice(0, 10)}
                    </div>
                    <div>
                      {t("payroll.absenceNote")}: {a.note || "—"}
                    </div>
                    {!hideDestructive && (
                      <button
                        type="button"
                        className="text-red-700 text-xs border border-red-200 px-2 py-1 rounded-md hover:bg-red-50 mt-2 disabled:opacity-60"
                        disabled={deletingAbsenceId !== null}
                        onClick={() => void removeAbsence(a.id)}
                      >
                        {deletingAbsenceId === a.id ? "…" : t("payroll.absenceDelete")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className={`hidden md:block overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
                <table className="text-sm min-w-full">
                  <thead>
                    <tr className="border-b border-[#D5DADF]">
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">{t("payroll.absenceThEmployee")}</th>
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">{t("payroll.absenceThType")}</th>
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">{t("payroll.absenceThPeriod")}</th>
                      <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">{t("payroll.absenceNote")}</th>
                      {!hideDestructive && <th className="p-2 text-[13px] font-semibold text-[#34495E]" />}
                    </tr>
                  </thead>
                  <tbody>
                    {absences.map((a) => (
                      <tr key={a.id} className="border-t border-[#EBEDF0]">
                        <td className="p-2">
                          {a.employee.lastName} {a.employee.firstName}
                        </td>
                        <td className="p-2">
                          {a.type === "VACATION"
                            ? t("payroll.absenceVacation")
                            : t("payroll.absenceSick")}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {String(a.startDate).slice(0, 10)} — {String(a.endDate).slice(0, 10)}
                        </td>
                        <td className="p-2">{a.note || "—"}</td>
                        {!hideDestructive && (
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
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
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
