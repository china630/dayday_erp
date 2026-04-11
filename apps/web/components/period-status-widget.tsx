"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

type PeriodStatusPayload = {
  year: number;
  month: number;
  periodKey: string;
  isClosed: boolean;
};

type Props = {
  periodStatus: PeriodStatusPayload | null;
  periodStatusErr: string | null;
  canClose: boolean;
};

export function PeriodStatusWidget({
  periodStatus,
  periodStatusErr,
  canClose,
}: Props) {
  const { t } = useTranslation();

  if (periodStatusErr) {
    return (
      <p className="text-amber-700 text-sm mb-4">{periodStatusErr}</p>
    );
  }

  if (!periodStatus) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 shadow-md rounded-xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          {t("dashboard.periodWidgetTitle")}
        </h3>
        <p className="text-sm text-gray-600 mt-1 font-mono tabular-nums">
          {periodStatus.periodKey}
        </p>
        <p className="mt-2">
          <span
            className={
              periodStatus.isClosed
                ? "inline-flex items-center rounded-full bg-slate-100 text-slate-800 px-3 py-1 text-sm font-medium"
                : "inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 px-3 py-1 text-sm font-medium"
            }
          >
            {periodStatus.isClosed
              ? t("dashboard.periodClosed")
              : t("dashboard.periodOpen")}
          </span>
        </p>
      </div>
      {canClose ? (
        <Link
          href="/#close-period-section"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-action/25 bg-action/10 text-primary text-sm font-medium hover:bg-action/15 transition"
        >
          {t("dashboard.periodGoClose")}
        </Link>
      ) : null}
    </div>
  );
}
