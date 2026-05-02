"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CARD_CONTAINER_CLASS,
  MODAL_CHECKBOX_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  MODAL_INPUT_NUMERIC_CLASS,
} from "../../lib/design-system";
import { Button } from "../ui/button";

export function PayrollRunModal({
  open,
  onClose,
  busy,
  defaultYear,
  defaultMonth,
  timesheetApprovedAvailable,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  defaultYear: number;
  defaultMonth: number;
  timesheetApprovedAvailable: boolean;
  onCreate: (payload: { year: number; month: number; importTimesheet: boolean }) => void;
}) {
  const { t } = useTranslation();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [importTimesheet, setImportTimesheet] = useState(false);

  useEffect(() => {
    if (!open) return;
    setYear(defaultYear);
    setMonth(defaultMonth);
    setImportTimesheet(false);
  }, [open, defaultYear, defaultMonth]);

  const canImport = useMemo(
    () => Boolean(timesheetApprovedAvailable),
    [timesheetApprovedAvailable],
  );

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      toast.error(t("common.fillRequired"));
      return;
    }
    if (!Number.isFinite(m) || m < 1 || m > 12) {
      toast.error(t("common.fillRequired"));
      return;
    }
    onCreate({ year: y, month: m, importTimesheet: canImport && importTimesheet });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-lg font-semibold leading-snug text-[#34495E]">{t("payroll.newRun")}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("payroll.newRunHint")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("payroll.year")}
                <input
                  type="number"
                  className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  min={2000}
                  max={2100}
                />
              </label>
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("payroll.month")}
                <input
                  type="number"
                  className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  min={1}
                  max={12}
                />
              </label>
            </div>

            {canImport ? (
              <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#34495E]">
                <input
                  type="checkbox"
                  checked={importTimesheet}
                  onChange={(e) => setImportTimesheet(e.target.checked)}
                  className={`mt-0.5 ${MODAL_CHECKBOX_CLASS}`}
                />
                <span>
                  <span className="font-semibold">{t("payroll.importTimesheet")}</span>
                  <span className="mt-0.5 block text-[13px] text-[#7F8C8D]">{t("payroll.importTimesheetHint")}</span>
                </span>
              </label>
            ) : null}
          </div>

          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : t("payroll.createDraft")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
