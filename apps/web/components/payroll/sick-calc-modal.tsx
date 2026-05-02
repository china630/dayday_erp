"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
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

export function SickCalcModal({
  open,
  onClose,
  employees,
  defaultEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  employees: EmpOpt[];
  defaultEmployeeId: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [out, setOut] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!open) return;
    setOut(null);
    setEmployeeId(defaultEmployeeId || employees[0]?.id || "");
    setFrom("");
    setTo("");
  }, [open, defaultEmployeeId, employees]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!employeeId || !from || !to) {
      toast.error(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    setOut(null);
    const res = await apiFetch("/api/hr/absences/sick-pay/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        periodStart: from,
        periodEnd: to,
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
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-[13px] font-semibold leading-snug text-[#34495E]">{t("payroll.sickCalcTitle")}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("payroll.sickCalcHint")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
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
                <div className="font-semibold text-[#34495E]">{t("payroll.sickCalcResult")}</div>
                <div>
                  {t("payroll.sickEmployerPay")}: {formatMoneyAzn(out.employerSickPayAmount)} AZN
                </div>
                <div className="text-[13px] text-[#7F8C8D]">
                  {t("payroll.sickStajYears")}: {out.serviceWholeYears} · {t("payroll.sickEmployerPct")}: {out.employerPercent}% ·{" "}
                  {t("payroll.sickEmployerDays")}: {out.employerCalendarDays} · DSMF: {out.dsmfCalendarDays}
                </div>
                {out.noteAz ? <div className="text-[13px] text-[#7F8C8D]">{out.noteAz}</div> : null}
              </div>
            ) : null}
          </div>

          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : t("payroll.sickCalcBtn")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
