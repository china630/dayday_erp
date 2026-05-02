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
import { Button } from "../ui/button";

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

  const selectedType = useMemo(() => types.find((x) => x.id === absenceTypeId), [types, absenceTypeId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (employees.length === 0 || types.length === 0) {
      toast.error(t("common.fillRequired"));
      return;
    }
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
      let message = await res.text();
      try {
        const body = JSON.parse(message) as {
          code?: string;
          conflict?: {
            absenceTypeName?: string;
            startDate?: string;
            endDate?: string;
          };
        };
        if (body.code === "ABSENCE_OVERLAP" && body.conflict) {
          message = t("payroll.absenceOverlapConflict", {
            type: body.conflict.absenceTypeName ?? "absence",
            from: body.conflict.startDate ?? t("common.emptyValue"),
            to: body.conflict.endDate ?? t("common.emptyValue"),
          });
        }
      } catch {
        /* keep raw text */
      }
      toast.error(t("common.saveErr"), { description: message });
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
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-lg font-semibold leading-snug text-[#34495E]">{t("payroll.absenceNew")}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("payroll.absencesTitle")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("payroll.pickEmployee")}
              <select
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </label>

            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("payroll.absenceType")}
              <select
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
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
                <p className="mb-0 mt-2 border-l-2 border-[#D5DADF] pl-2 text-[13px] leading-relaxed text-[#7F8C8D]">
                  {selectedType.description.trim()}
                </p>
              ) : null}
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("payroll.absenceFrom")}
                <input
                  type="date"
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("payroll.absenceTo")}
                <input
                  type="date"
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>

            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("payroll.absenceNote")}
              <input
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>

          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : t("employees.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
