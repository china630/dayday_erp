"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  MODAL_INPUT_CLASS,
} from "../../lib/design-system";
import { formatMoneyAzn } from "../../lib/format-money";
import { Button } from "../ui/button";

type EmpOpt = { id: string; firstName: string; lastName: string };
type AbsenceTypeOpt = { id: string; nameAz: string; formula: string };

type VacationCalcOut = {
  calendarDays: number | string;
  averageMonthlyGross: string;
  averageDailyGross: string;
  vacationPayAmount: string;
  divisor304?: string;
  totalGrossInWindow?: string;
  monthsInAverage?: number | string;
  monthsWithData?: number | string;
  /** Ожидаемое число месяцев в окне (если API вернуло). */
  monthsExpected?: number | string;
};

export function VacationCalcModal({
  open,
  onClose,
  employees,
  absenceTypes,
  defaultEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  employees: EmpOpt[];
  absenceTypes: AbsenceTypeOpt[];
  defaultEmployeeId: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [absenceTypeId, setAbsenceTypeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [out, setOut] = useState<VacationCalcOut | null>(null);

  const laborTypes = useMemo(
    () => absenceTypes.filter((x) => x.formula === "LABOR_LEAVE_304"),
    [absenceTypes],
  );

  useEffect(() => {
    if (!open) return;
    setOut(null);
    setEmployeeId(defaultEmployeeId || employees[0]?.id || "");
    setAbsenceTypeId((prev) => {
      if (prev && laborTypes.some((x) => x.id === prev)) return prev;
      return laborTypes[0]?.id ?? "";
    });
    setFrom("");
    setTo("");
  }, [open, defaultEmployeeId, employees, laborTypes]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!employeeId || !from || !to) {
      toast.error(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    setOut(null);
    const res = await apiFetch("/api/hr/absences/vacation-pay/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        vacationStart: from,
        vacationEnd: to,
        ...(absenceTypeId ? { absenceTypeId } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.loadErr"), { description: await res.text() });
      return;
    }
    setOut((await res.json()) as VacationCalcOut);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-lg font-semibold leading-snug text-[#34495E]">{t("payroll.vacationCalc")}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("payroll.vacationCalcHint")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={`${MODAL_FIELD_LABEL_CLASS} md:col-span-2`}>
                {t("payroll.pickEmployee")}
                <select
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.lastName} {e.firstName}
                    </option>
                  ))}
                </select>
              </label>

              {laborTypes.length > 0 ? (
                <label className={`${MODAL_FIELD_LABEL_CLASS} md:col-span-2`}>
                  {t("payroll.absenceKindLabor")}
                  <select
                    className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                    value={absenceTypeId}
                    onChange={(e) => setAbsenceTypeId(e.target.value)}
                  >
                    {laborTypes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nameAz}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("payroll.absenceFrom")}
                <input type="date" className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`} value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("payroll.absenceTo")}
                <input type="date" className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`} value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>

            {out ? (
              <div className="space-y-1 rounded-[2px] border border-[#D5DADF] bg-[#F4F5F7] p-4 text-[13px] text-[#34495E]">
                <div className="font-semibold text-[#34495E]">{t("payroll.calcResult")}</div>
                <div>
                  {formatMoneyAzn(out.vacationPayAmount)} AZN ({Number(out.calendarDays)}{" "}
                  {t("payroll.absenceThPeriod").toLowerCase()})
                </div>
                {out.monthsExpected != null && String(out.monthsExpected) !== "" ? (
                  <div className="text-[13px] text-[#7F8C8D]">
                    {t("payroll.calcMonths", { n: Number(out.monthsExpected) || 0 })}
                  </div>
                ) : null}
                <div className="text-[13px] text-[#7F8C8D]">
                  Ø mes.: {out.averageMonthlyGross} · Ø gün: {out.averageDailyGross} · 12 ay:{" "}
                  {out.totalGrossInWindow} · ay sayı: {out.monthsWithData ?? out.monthsInAverage}
                  {out.divisor304 ? ` · ÷ ${out.divisor304}` : ""}
                </div>
              </div>
            ) : null}
          </div>

          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : t("payroll.calcBtn")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
