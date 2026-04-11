"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { LINK_ACCENT_CLASS } from "../lib/design-system";
import { useSubscription } from "../lib/subscription-context";

function fmtQuota(
  current: number,
  max: number | null,
): { text: string; atLimit: boolean } {
  if (max == null) {
    return { text: String(current), atLimit: false };
  }
  return { text: `${current}/${max}`, atLimit: current >= max };
}

export function HeaderSubscriptionStrip() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { ready, effectiveSnapshot: snapshot } = useSubscription();

  if (!token || !user?.organizationId || !ready || !snapshot) {
    return null;
  }

  const tier = String(snapshot.tier).toUpperCase();
  const tierLabel = t(`subscriptionSettings.tierNames.${tier}`, {
    defaultValue: tier,
  });
  const inv = fmtQuota(
    snapshot.quotas.invoicesThisMonth.current,
    snapshot.quotas.invoicesThisMonth.max,
  );
  const emp = fmtQuota(
    snapshot.quotas.employees.current,
    snapshot.quotas.employees.max,
  );

  return (
    <div className="hidden sm:flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-gray-600 max-w-[min(100%,520px)]">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 font-medium text-primary border border-action/15">
        {tierLabel}
        {snapshot.isTrial && snapshot.trialDaysLeft != null && snapshot.trialDaysLeft > 0 ? (
          <span className="text-amber-800 font-normal">
            · {t("headerStrip.trialDays", { days: snapshot.trialDaysLeft })}
          </span>
        ) : null}
        {snapshot.readOnly ? (
          <span className="text-red-700 font-normal">· {t("headerStrip.readOnly")}</span>
        ) : null}
      </span>
      <span
        className={[
          "tabular-nums",
          inv.atLimit ? "text-amber-800 font-medium" : "",
        ].join(" ")}
        title={t("subscriptionSettings.quotaInvoices")}
      >
        {t("headerStrip.invoices")}: {inv.text}
      </span>
      <span
        className={[
          "tabular-nums",
          emp.atLimit ? "text-amber-800 font-medium" : "",
        ].join(" ")}
        title={t("subscriptionSettings.quotaEmployees")}
      >
        {t("headerStrip.employees")}: {emp.text}
      </span>
      <Link href="/admin/billing" className={`${LINK_ACCENT_CLASS} shrink-0`}>
        {t("headerStrip.manage")}
      </Link>
    </div>
  );
}
