"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../lib/form-styles";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} w-full max-w-xl bg-white p-6 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">
              {t("payroll.newRun")}
            </h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">
              {t("payroll.newRun")}
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

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ year, month, importTimesheet: canImport && importTimesheet });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("payroll.year")}</span>
              <input
                type="number"
                className={FORM_INPUT_CLASS}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2000}
                max={2100}
                required
              />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("payroll.month")}</span>
              <input
                type="number"
                className={FORM_INPUT_CLASS}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                min={1}
                max={12}
                required
              />
            </div>
          </div>

          {canImport ? (
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
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
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={onClose}
              disabled={busy}
            >
              {t("common.back")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : t("payroll.createDraft")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

