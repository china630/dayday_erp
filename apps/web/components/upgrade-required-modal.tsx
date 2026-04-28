"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api-client";

type ModalReason = "quota" | "read_only";
type CustomUpgradeDetail = {
  title?: string;
  body?: string;
};
type UpgradePreviewResponse = {
  amountToPay: string;
  daysRemaining: number;
  currentTier: string;
  newTier: string;
};

/**
 * Shown on 402 QUOTA_EXCEEDED: upgrade / subscription (PRD §7.12).
 */
export function UpgradePlanModalHost() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ModalReason>("quota");
  const [quotaDetail, setQuotaDetail] = useState<unknown>(null);
  const [custom, setCustom] = useState<CustomUpgradeDetail | null>(null);
  const [preview, setPreview] = useState<UpgradePreviewResponse | null>(null);

  const onQuota = useCallback((ev: Event) => {
    const ce = ev as CustomEvent<unknown>;
    setQuotaDetail(ce.detail ?? null);
    setReason("quota");
    setOpen(true);
  }, []);

  const onReadOnly = useCallback(() => {
    setCustom(null);
    setReason("read_only");
    setOpen(true);
  }, []);

  const onCustomUpgrade = useCallback((ev: Event) => {
    const ce = ev as CustomEvent<CustomUpgradeDetail>;
    setCustom(ce.detail ?? null);
    setOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener("dayday:subscription-read-only", onReadOnly);
    window.addEventListener("dayday:quota-upgrade", onQuota);
    window.addEventListener("dayday:upgrade-modal-custom", onCustomUpgrade);
    return () => {
      window.removeEventListener("dayday:subscription-read-only", onReadOnly);
      window.removeEventListener("dayday:quota-upgrade", onQuota);
      window.removeEventListener("dayday:upgrade-modal-custom", onCustomUpgrade);
    };
  }, [onCustomUpgrade, onQuota, onReadOnly]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await apiFetch("/api/billing/upgrade-preview?newTier=ENTERPRISE");
      if (cancelled || !res.ok) {
        if (!cancelled) setPreview(null);
        return;
      }
      const data = (await res.json()) as UpgradePreviewResponse;
      if (!cancelled) {
        setPreview(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
  const title = custom?.title?.trim() || (reason === "quota" ? t("upgradeModal.quotaTitle") : t("upgradeModal.title"));
  const text = custom?.body?.trim() || body;

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
          {title}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
        {preview && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              {t("upgradeModal.previewTitle")}
            </p>
            <p className="mt-1 text-sm text-emerald-900">
              {t("upgradeModal.previewBody", {
                amount: preview.amountToPay,
                daysRemaining: preview.daysRemaining,
                currentTier: preview.currentTier,
              })}
            </p>
          </div>
        )}
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
