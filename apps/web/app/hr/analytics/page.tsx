"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { ModulePageLinks } from "../../../components/module-page-links";
import { EmptyState } from "../../../components/empty-state";
import { apiFetch } from "../../../lib/api-client";
import { parseHrEmployeesResponse } from "../../../lib/hr-employees-list";
import { useRequireAuth } from "../../../lib/use-require-auth";
import {
  CARD_CONTAINER_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type EmpOpt = { id: string; firstName: string; lastName: string };
type AbsenceTypeOpt = { id: string; nameAz: string; code: string; formula: string };
type AbsenceRow = {
  id: string;
  startDate: string;
  endDate: string;
  note: string;
  employee: EmpOpt;
  absenceType?: AbsenceTypeOpt;
};

function utcDayKey(y: number, m0: number, d: number): number {
  return Date.UTC(y, m0, d);
}

function parseIsoDayUtc(s: string): number {
  const x = s.slice(0, 10);
  return Date.UTC(
    Number(x.slice(0, 4)),
    Number(x.slice(5, 7)) - 1,
    Number(x.slice(8, 10)),
  );
}

function absenceCellKinds(
  absences: AbsenceRow[],
  y: number,
  m0: number,
  d: number,
): { vacation: boolean; sick: boolean; unpaid: boolean } {
  const day = utcDayKey(y, m0, d);
  let vacation = false;
  let sick = false;
  let unpaid = false;
  for (const a of absences) {
    const a0 = parseIsoDayUtc(a.startDate);
    const a1 = parseIsoDayUtc(a.endDate);
    if (day < a0 || day > a1) continue;
    const f = a.absenceType?.formula;
    if (f === "SICK_LEAVE_STAJ") sick = true;
    else if (f === "UNPAID_RECORD" || a.absenceType?.code === "UNPAID_LEAVE") unpaid = true;
    else vacation = true;
  }
  return { vacation, sick, unpaid };
}

export default function HrAnalyticsPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceTypeOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  const pollAbortRef = useRef(false);

  useEffect(() => {
    return () => {
      pollAbortRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      const [er, ea, et] = await Promise.all([
        apiFetch("/api/hr/employees?page=1&pageSize=500"),
        apiFetch("/api/hr/absences"),
        apiFetch("/api/hr/absence-types"),
      ]);
      if (cancelled) return;
      if (!er.ok) setErr(`${t("employees.loadErr")}: ${er.status}`);
      else {
        const parsed = parseHrEmployeesResponse<EmpOpt>(await er.json());
        setEmployees(parsed.items);
      }
      if (!ea.ok) setErr(`${t("payroll.loadErr")}: ${ea.status}`);
      else setAbsences((await ea.json()) as AbsenceRow[]);
      if (et.ok) setAbsenceTypes((await et.json()) as AbsenceTypeOpt[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token, t]);

  const legend = useMemo(
    () => [
      { color: "bg-blue-200", label: t("payroll.calendarLegendVacation") },
      { color: "bg-yellow-200", label: t("payroll.calendarLegendSick") },
      { color: "bg-orange-400", label: "Ödənişsiz məzuniyyət" },
      {
        color: "bg-gradient-to-br from-blue-200 to-yellow-200",
        label: `${t("payroll.calendarLegendVacation")} + ${t("payroll.calendarLegendSick")}`,
      },
    ],
    [t],
  );

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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#34495E]">İnfoqrafika</h1>
          <p className="mt-1 text-[13px] text-[#7F8C8D]">
            Məzuniyyət və xəstəlik təqvimi
          </p>
        </div>
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

      {err ? <p className="text-red-600 text-sm">{err}</p> : null}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

      {!loading && absences.length === 0 ? (
        <EmptyState title={t("payroll.calendarTitle")} description={t("payroll.calendarHint")} />
      ) : (
        <section className={`${CARD_CONTAINER_CLASS} p-4`}>
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
                const { vacation, sick, unpaid } = absenceCellKinds(absences, calYear, m0, d);
                let bg = "bg-slate-50";
                if (unpaid) bg = "bg-orange-400";
                else if (vacation && sick) bg = "bg-gradient-to-br from-blue-200 to-yellow-200";
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

          <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-600">
            {legend.map((it) => (
              <span key={it.label} className="inline-flex items-center gap-2">
                <span className={`h-3 w-3 rounded border border-slate-200 ${it.color}`} />
                {it.label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* keep these loaded to ensure translations are present and to prevent accidental tree-shaking */}
      <div className="hidden" aria-hidden>
        {employees.length} {absenceTypes.length}
      </div>
    </div>
  );
}

