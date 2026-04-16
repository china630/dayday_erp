"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../lib/form-styles";
import { formatMoneyAzn } from "../../lib/format-money";

type EmpOpt = { id: string; firstName: string; lastName: string };
type AbsenceTypeOpt = { id: string; nameAz: string; formula: string };

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
  const [out, setOut] = useState<Record<string, string> | null>(null);

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
    setOut((await res.json()) as Record<string, string>);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-2xl bg-white p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">{t("payroll.vacationCalc")}</h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">{t("payroll.vacationCalcHint")}</p>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <span className={FORM_LABEL_CLASS}>{t("payroll.pickEmployee")}</span>
              <select className={FORM_INPUT_CLASS} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </div>

            {laborTypes.length > 0 ? (
              <div className="md:col-span-2">
                <span className={FORM_LABEL_CLASS}>{t("payroll.absenceKindLabor")}</span>
                <select className={FORM_INPUT_CLASS} value={absenceTypeId} onChange={(e) => setAbsenceTypeId(e.target.value)}>
                  {laborTypes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nameAz}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <span className={FORM_LABEL_CLASS}>{t("payroll.absenceFrom")}</span>
              <input type="date" className={FORM_INPUT_CLASS} value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("payroll.absenceTo")}</span>
              <input type="date" className={FORM_INPUT_CLASS} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {out ? (
            <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-1">
              <div className="font-semibold text-gray-900">{t("payroll.calcResult")}</div>
              <div>
                {formatMoneyAzn(out.vacationPayAmount)} AZN ({Number(out.calendarDays)}{" "}
                {t("payroll.absenceThPeriod").toLowerCase()})
              </div>
              <div className="text-slate-600 text-xs">
                Ø мес.: {out.averageMonthlyGross} · Ø gün: {out.averageDailyGross} · ay sayı: {out.monthsInAverage}
                {out.divisor304 ? ` · ÷ ${out.divisor304}` : ""}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} disabled={busy}>
              {t("common.back")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : t("payroll.calcBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

