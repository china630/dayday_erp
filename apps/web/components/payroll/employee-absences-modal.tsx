"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CARD_CONTAINER_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
} from "../../lib/design-system";
import { apiFetch } from "../../lib/api-client";
import { Button } from "../ui/button";

type AbsenceTypeOpt = { id: string; nameAz: string; code: string; formula: string };
export type EmployeeAbsenceRow = {
  id: string;
  startDate: string;
  endDate: string;
  note: string;
  employee: { id: string; firstName: string; lastName: string };
  absenceType?: AbsenceTypeOpt;
};

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

function overlapsMonth(a: EmployeeAbsenceRow, year: number, month: number): boolean {
  const { startT, endT } = monthBoundsUtc(year, month);
  const a0 = parseIsoDayUtcT(a.startDate);
  const a1 = parseIsoDayUtcT(a.endDate);
  return a1 >= startT && a0 <= endT;
}

export function EmployeeAbsencesModal({
  open,
  onClose,
  employeeId,
  employeeLabel,
  year,
  month,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  employeeLabel?: string;
  year: number;
  month: number;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [rowsAll, setRowsAll] = useState<EmployeeAbsenceRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const periodLabel = `${String(month).padStart(2, "0")}.${year}`;

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !employeeId) return;
    let cancelled = false;
    setBusy(true);
    setLoadErr(null);
    void apiFetch("/api/hr/absences")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadErr(`${res.status}`);
          setRowsAll([]);
          return;
        }
        const data = (await res.json()) as EmployeeAbsenceRow[];
        setRowsAll(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadErr("load");
        setRowsAll([]);
      })
      .finally(() => {
        if (cancelled) return;
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, employeeId]);

  const employee = useMemo(() => {
    if (!employeeId) return null;
    const a = rowsAll.find((x) => x.employee?.id === employeeId);
    return a?.employee ?? null;
  }, [rowsAll, employeeId]);

  const rows = useMemo(() => {
    if (!employeeId) return [];
    return rowsAll
      .filter((a) => a.employee?.id === employeeId)
      .filter((a) => overlapsMonth(a, year, month))
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  }, [rowsAll, employeeId, year, month]);

  if (!open || !employeeId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-[13px] font-semibold leading-snug text-[#34495E]">
              {employee ? `${employee.lastName} ${employee.firstName}` : employeeLabel || t("common.emptyValue")}
            </h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">
              {t("payroll.employeeAbsencesSubtitle", { period: periodLabel })}
            </p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {loadErr ? (
            <div className="text-[13px] text-red-700">
              {t("common.loadErr")}: {loadErr}
            </div>
          ) : busy ? (
            <div className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-[#7F8C8D]">{t("common.emptyValue")}</div>
          ) : (
            <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#D5DADF]">
                    <th className="p-2 text-left font-semibold text-[#34495E]">{t("payroll.absenceThType")}</th>
                    <th className="p-2 text-left font-semibold text-[#34495E]">{t("payroll.absenceThPeriod")}</th>
                    <th className="p-2 text-left font-semibold text-[#34495E]">{t("payroll.absenceNote")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-t border-[#EBEDF0]">
                      <td className="p-2">{a.absenceType?.nameAz ?? t("payroll.absenceTypeUnknown")}</td>
                      <td className="whitespace-nowrap p-2 tabular-nums">
                        {String(a.startDate).slice(0, 10)} — {String(a.endDate).slice(0, 10)}
                      </td>
                      <td className="p-2">{a.note?.trim() ? a.note : t("common.emptyValue")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={MODAL_FOOTER_ACTIONS_CLASS}>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
