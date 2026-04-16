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

type EmpOpt = { id: string; firstName: string; lastName: string };
type AbsenceTypeOpt = {
  id: string;
  nameAz: string;
  code: string;
  formula: string;
  description?: string;
};

export function AbsenceModal({
  open,
  onClose,
  employees,
  types,
  defaultEmployeeId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  employees: EmpOpt[];
  types: AbsenceTypeOpt[];
  defaultEmployeeId: string;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [empId, setEmpId] = useState("");
  const [absenceTypeId, setAbsenceTypeId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setNote("");
    setFrom("");
    setTo("");
    setEmpId(
      defaultEmployeeId && employees.some((e) => e.id === defaultEmployeeId)
        ? defaultEmployeeId
        : employees[0]?.id ?? "",
    );
    setAbsenceTypeId(types[0]?.id ?? "");
  }, [open, defaultEmployeeId, employees, types]);

  const selectedType = useMemo(
    () => types.find((x) => x.id === absenceTypeId),
    [types, absenceTypeId],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!empId || !absenceTypeId || !from || !to) {
      toast.error(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/hr/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: empId,
        absenceTypeId,
        startDate: from,
        endDate: to,
        note,
      }),
    });
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    onSaved();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} w-full max-w-xl bg-white p-6 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">
              {t("payroll.absenceNew")}
            </h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">
              {t("payroll.absenceNew")}
            </p>
          </div>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={onClose}
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <span className={FORM_LABEL_CLASS}>{t("payroll.pickEmployee")}</span>
            <select
              className={FORM_INPUT_CLASS}
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName} {e.firstName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className={FORM_LABEL_CLASS}>{t("payroll.absenceType")}</span>
            <select
              className={FORM_INPUT_CLASS}
              value={absenceTypeId}
              onChange={(e) => setAbsenceTypeId(e.target.value)}
            >
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nameAz} ({x.code})
                </option>
              ))}
            </select>
            {selectedType?.description?.trim() ? (
              <p className="text-xs text-slate-600 mt-2 leading-relaxed border-l-2 border-[#D5DADF] pl-2">
                {selectedType.description.trim()}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("payroll.absenceFrom")}</span>
              <input
                type="date"
                className={FORM_INPUT_CLASS}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("payroll.absenceTo")}</span>
              <input
                type="date"
                className={FORM_INPUT_CLASS}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <span className={FORM_LABEL_CLASS}>{t("payroll.absenceNote")}</span>
            <input
              className={FORM_INPUT_CLASS}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={onClose}
              disabled={busy}
            >
              {t("common.back")}
            </button>
            <button
              type="submit"
              className={PRIMARY_BUTTON_CLASS}
              disabled={busy || employees.length === 0 || types.length === 0}
            >
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : t("employees.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

