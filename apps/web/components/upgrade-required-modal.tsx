"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ModalReason = "quota" | "read_only";

/**
 * Shown on 402 QUOTA_EXCEEDED: upgrade / subscription (PRD §7.12).
 */
export function UpgradePlanModalHost() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ModalReason>("quota");
  const [quotaDetail, setQuotaDetail] = useState<unknown>(null);

  const onQuota = useCallback((ev: Event) => {
    const ce = ev as CustomEvent<unknown>;
    setQuotaDetail(ce.detail ?? null);
    setReason("quota");
    setOpen(true);
  }, []);

  const onReadOnly = useCallback(() => {
    setReason("read_only");
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener("dayday:subscription-read-only", onReadOnly);
    window.addEventListener("dayday:quota-upgrade", onQuota);
    return () => {
      window.removeEventListener("dayday:subscription-read-only", onReadOnly);
      window.removeEventListener("dayday:quota-upgrade", onQuota);
    };
  }, [onQuota, onReadOnly]);

  if (!open) return null;

  const lang = i18n.language.startsWith("az") ? "az" : "ru";
  const quotaMsg =
    quotaDetail &&
    typeof quotaDetail === "object" &&
    quotaDetail !== null &&
    "message" in quotaDetail &&
    typeof (quotaDetail as { message?: { az?: string; ru?: string } }).message ===
      "object"
      ? (quotaDetail as { message: { az?: string; ru?: string } }).message[
          lang === "az" ? "az" : "ru"
        ]
      : null;

  const body =
    reason === "quota"
      ? quotaMsg || t("upgradeModal.quotaBody")
      : t("upgradeModal.body");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-plan-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
        <h2
          id="upgrade-plan-modal-title"
          className="text-lg font-semibold text-slate-900"
        >
          {reason === "quota" ? t("upgradeModal.quotaTitle") : t("upgradeModal.title")}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("upgradeModal.close")}
          </button>
          <Link
            href="/settings/subscription"
            onClick={() => setOpen(false)}
            className="inline-flex justify-center rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-action-hover"
          >
            {t("upgradeModal.openSubscription")}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use {@link UpgradePlanModalHost} */
export const UpgradeRequiredModalHost = UpgradePlanModalHost;
