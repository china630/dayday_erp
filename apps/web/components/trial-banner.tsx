"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useSubscription } from "../lib/subscription-context";

export function TrialBanner() {
  const { t } = useTranslation();
  const { ready, effectiveSnapshot: snapshot } = useSubscription();

  if (!ready || !snapshot) return null;

  if (snapshot.readOnly) {
    return (
      <div
        className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm leading-snug text-red-950 shadow-sm"
        role="alert"
      >
        <span className="font-medium">{t("trialBanner.readOnlyTitle")}</span>
        <span className="mx-2 text-red-300/90" aria-hidden>
          |
        </span>
        <span>{t("trialBanner.readOnlyBody")}</span>{" "}
        <Link
          href="/admin/billing"
          className="ml-1 font-semibold text-action underline decoration-action/40 underline-offset-2 hover:text-primary"
        >
          {t("trialBanner.readOnlyCta")}
        </Link>
      </div>
    );
  }

  if (!snapshot.isTrial) return null;
  if (snapshot.trialDaysLeft == null || snapshot.trialDaysLeft <= 0) return null;

  const days = snapshot.trialDaysLeft;

  return (
    <div
      className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm leading-snug text-amber-950 shadow-sm"
      role="status"
    >
      <span className="font-medium">{t("trialBanner.az", { days })}</span>
      <span className="mx-2 text-amber-300/90" aria-hidden>
        |
      </span>
      <span>{t("trialBanner.ru", { days })}</span>{" "}
      <Link
        href="/admin/billing"
        className="ml-1 font-semibold text-action underline decoration-action/40 underline-offset-2 hover:text-primary"
      >
        {t("trialBanner.cta")}
      </Link>
    </div>
  );
}
