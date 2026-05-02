"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api-client";
import { uiLangRuAz } from "../lib/i18n/ui-lang";
import {
  CARD_CONTAINER_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../lib/design-system";
import { Button } from "./ui/button";

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

  const lang = uiLangRuAz(i18n.language);
  const quotaMsg =
    quotaDetail &&
    typeof quotaDetail === "object" &&
    quotaDetail !== null &&
    "message" in quotaDetail &&
    typeof (quotaDetail as { message?: { az?: string; ru?: string } }).message === "object"
      ? (quotaDetail as { message: { az?: string; ru?: string } }).message[lang]
      : null;

  const body =
    reason === "quota" ? quotaMsg || t("upgradeModal.quotaBody") : t("upgradeModal.body");
  const title = custom?.title?.trim() || (reason === "quota" ? t("upgradeModal.quotaTitle") : t("upgradeModal.title"));
  const text = custom?.body?.trim() || body;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-plan-modal-title"
    >
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] min-h-0 w-full max-w-md flex-col overflow-hidden bg-white p-6 shadow-sm`}
      >
        <h2
          id="upgrade-plan-modal-title"
          className="m-0 shrink-0 text-lg font-semibold leading-snug text-[#34495E]"
        >
          {title}
        </h2>
        <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto">
          <p className="mb-0 text-[13px] leading-relaxed text-[#7F8C8D]">{text}</p>
          {preview ? (
            <div className="rounded-[2px] border border-[#D5DADF] bg-[#F4F5F7] px-3 py-2.5">
              <p className="m-0 text-[13px] font-semibold text-[#34495E]">{t("upgradeModal.previewTitle")}</p>
              <p className="mb-0 mt-1 text-[13px] leading-snug text-[#34495E]">
                {t("upgradeModal.previewBody", {
                  amount: preview.amountToPay,
                  daysRemaining: preview.daysRemaining,
                  currentTier: preview.currentTier,
                })}
              </p>
            </div>
          ) : null}
        </div>
        <div className={MODAL_FOOTER_ACTIONS_CLASS}>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("upgradeModal.close")}
          </Button>
          <Link
            href="/settings/subscription"
            onClick={() => setOpen(false)}
            className={PRIMARY_BUTTON_CLASS}
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
