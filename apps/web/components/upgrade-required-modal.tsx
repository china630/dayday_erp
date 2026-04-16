"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Показывает модалку при 403 SUBSCRIPTION_READ_ONLY и при 402 QUOTA_EXCEEDED (см. apiFetch).
 */
export function UpgradeRequiredModalHost() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onEv = () => setOpen(true);
    window.addEventListener("dayday:subscription-read-only", onEv);
    window.addEventListener("dayday:quota-upgrade", onEv);
    return () => {
      window.removeEventListener("dayday:subscription-read-only", onEv);
      window.removeEventListener("dayday:quota-upgrade", onEv);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-required-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <h2
          id="upgrade-required-title"
          className="text-lg font-semibold text-slate-900"
        >
          {t("upgradeModal.title")}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {t("upgradeModal.body")}
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("upgradeModal.close")}
          </button>
          <Link
            href="/admin/billing"
            onClick={() => setOpen(false)}
            className="inline-flex justify-center rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-action-hover"
          >
            {t("upgradeModal.subscribe")}
          </Link>
        </div>
      </div>
    </div>
  );
}
