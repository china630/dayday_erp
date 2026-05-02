"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import {
  hasSubscriptionModuleAccess,
  useSubscription,
  type PaywallModuleKey,
} from "../lib/subscription-context";
import { uiLangRuAz } from "../lib/i18n/ui-lang";

export type PaywallModule = PaywallModuleKey;

export function SubscriptionPaywall({
  module,
  children,
}: {
  module: PaywallModule;
  children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { ready, effectiveSnapshot, fetchError, refetch } = useSubscription();

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (fetchError && !effectiveSnapshot) {
    return (
      <div className="relative z-10 rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center text-amber-900 space-y-4">
        <p className="text-sm font-medium">{t("subscription.loadErr")}</p>
        <p className="text-xs text-amber-800/90">{t("subscription.loadErrHint")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-100"
        >
          {t("common.retryCheck")}
        </button>
      </div>
    );
  }

  if (hasSubscriptionModuleAccess(effectiveSnapshot, module, user?.email)) {
    return <>{children}</>;
  }

  const benefitKeys = ["b1", "b2", "b3"] as const;

  return (
    <div className="relative z-20 w-full max-w-lg mx-auto">
      <div className="relative z-10 overflow-hidden rounded-2xl border border-[#D5DADF] bg-gradient-to-br from-white via-[#2980B9]/10 to-[#EBEDF0] shadow-lg shadow-[#2980B9]/15 px-8 py-10 text-center">
        <div
          className="pointer-events-none absolute -right-16 -top-16 z-0 h-48 w-48 rounded-full bg-[#2980B9]/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-12 z-0 h-40 w-40 rounded-full bg-[#7F8C8D]/10 blur-3xl"
          aria-hidden
        />

        <div className="relative z-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D5DADF] bg-white shadow-md">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2980B9"
              strokeWidth="2"
              aria-hidden
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>

          <p className="text-lg font-semibold text-slate-900 leading-snug">
            {t("subscription.paywall.titleAz")}
          </p>
          <p className="mt-2 text-sm text-slate-600">{t("subscription.paywall.titleRu")}</p>

          <ul className="mt-6 text-left space-y-2.5">
            {benefitKeys.map((suffix) => (
              <li
                key={suffix}
                className="flex gap-2 text-sm text-slate-700"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2980B9]" />
                <span>{t(`subscription.paywall.${module}.${suffix}`)}</span>
              </li>
            ))}
          </ul>

          <Link
            href={t("subscription.upgradeHref")}
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-action px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-action-hover focus:outline-none focus:ring-2 focus:ring-action focus:ring-offset-2"
          >
            {t("subscription.paywall.cta")}
          </Link>
          {uiLangRuAz(i18n.language) === "ru" ? (
            <p className="mt-3 text-xs text-slate-500">{t("subscription.paywall.ctaHintRu")}</p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">{t("subscription.paywall.ctaHintAz")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
