"use client";

import Link from "next/link";
import {
  Building2,
  Calculator,
  Factory,
  Landmark,
  Lock,
  Package,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  LINK_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import {
  useSubscription,
  type SubscriptionTier,
} from "../../../lib/subscription-context";
import { useAuth } from "../../../lib/auth-context";
import { canAccessBilling } from "../../../lib/role-utils";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { EmptyState } from "../../../components/empty-state";
import { PaymentConfirmationModal } from "../../../components/payment-confirmation-modal";
import { toast } from "sonner";

type BillingCatalogModule = {
  id: string;
  key: string;
  name: string;
  pricePerMonth: number;
  sortOrder: number;
};

type BillingCatalog = {
  currency: string;
  foundationMonthlyAzn: number;
  modules: BillingCatalogModule[];
};

function isModuleActiveInSubscription(
  active: string[],
  key: string,
): boolean {
  if (active.includes(key)) return true;
  if (key === "manufacturing") return active.includes("production");
  if (key === "ifrs_mapping") return active.includes("ifrs");
  return false;
}

function moduleIcon(key: string) {
  const common = "h-5 w-5 shrink-0 text-[#2980B9]";
  switch (key) {
    case "kassa_pro":
      return <Wallet className={common} aria-hidden />;
    case "banking_pro":
      return <Landmark className={common} aria-hidden />;
    case "inventory":
      return <Package className={common} aria-hidden />;
    case "manufacturing":
      return <Factory className={common} aria-hidden />;
    case "hr_full":
      return <Users className={common} aria-hidden />;
    case "ifrs_mapping":
      return <Calculator className={common} aria-hidden />;
    default:
      return <Package className={common} aria-hidden />;
  }
}

function QuotaProgress({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number | null;
}) {
  const pct =
    max == null || max === 0 ? 0 : Math.min(100, (current / max) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[13px] text-[#34495E]">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-[#34495E]">
          {max == null ? (
            <span>
              {current}{" "}
              <span className="text-[#7F8C8D] font-normal">(∞)</span>
            </span>
          ) : (
            <>
              {current} / {max}
            </>
          )}
        </span>
      </div>
      {max != null && (
        <div className="h-2 w-full overflow-hidden rounded-[2px] bg-[#EBEDF0]">
          <div
            className="h-full rounded-[2px] bg-[#2980B9] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function SubscriptionSettingsPage() {
  const { t, i18n } = useTranslation();
  useRequireAuth();
  const { token, ready, user, organizations, organizationId } = useAuth();
  const {
    effectiveSnapshot,
    ready: subReady,
    fetchError,
    refetch,
  } = useSubscription();
  const [catalog, setCatalog] = useState<BillingCatalog | null>(null);
  const [catalogErr, setCatalogErr] = useState<string | null>(null);
  const [moduleBusyKey, setModuleBusyKey] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<
    | null
    | {
        mode: "enable" | "disable";
        moduleKey: string;
        monthlyAzn: string;
        proRataAzn: string;
        paymentUrl?: string;
      }
  >(null);

  const locale = i18n.language.startsWith("az") ? "az-AZ" : "ru-RU";

  const currentOrg = useMemo(
    () => organizations.find((o) => o.id === organizationId) ?? null,
    [organizations, organizationId],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setCatalogErr(null);
      const res = await apiFetch("/api/billing/catalog");
      if (cancelled) return;
      if (!res.ok) {
        setCatalogErr(await res.text());
        setCatalog(null);
        return;
      }
      setCatalog((await res.json()) as BillingCatalog);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const expiresLabel = useMemo(() => {
    if (!effectiveSnapshot?.expiresAt)
      return t("subscriptionSettings.expiresNone");
    try {
      return new Date(effectiveSnapshot.expiresAt).toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return effectiveSnapshot.expiresAt;
    }
  }, [effectiveSnapshot?.expiresAt, locale, t]);

  const tierLabel = useCallback(
    (tier: SubscriptionTier) => t(`subscriptionSettings.tierNames.${tier}`),
    [t],
  );

  const activeModules = effectiveSnapshot?.activeModules ?? [];
  const isEnterprise = effectiveSnapshot?.tier === "ENTERPRISE";
  const readOnlySub = Boolean(effectiveSnapshot?.readOnly);

  const monthlyTotalAzn = useMemo(() => {
    if (!catalog || !effectiveSnapshot) return null;
    let sum = catalog.foundationMonthlyAzn;
    if (isEnterprise) {
      for (const m of catalog.modules) {
        sum += m.pricePerMonth;
      }
      return sum;
    }
    for (const m of catalog.modules) {
      if (isModuleActiveInSubscription(activeModules, m.key)) {
        sum += m.pricePerMonth;
      }
    }
    return sum;
  }, [catalog, effectiveSnapshot, activeModules, isEnterprise]);

  const isModuleOn = useCallback(
    (key: string) => {
      if (isEnterprise) return true;
      return isModuleActiveInSubscription(activeModules, key);
    },
    [isEnterprise, activeModules],
  );

  const onToggleModule = async (moduleKey: string, next: boolean) => {
    if (!token || isEnterprise || readOnlySub) return;
    setErr(null);
    setMsg(null);
    if (!next) {
      const mod = catalog?.modules.find((m) => m.key === moduleKey);
      setPayModal({
        mode: "disable",
        moduleKey,
        monthlyAzn: mod ? mod.pricePerMonth.toFixed(2) : "0.00",
        proRataAzn: "0.00",
      });
      return;
    }
    setModuleBusyKey(moduleKey);
    try {
      const res = await apiFetch("/api/billing/toggle-module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey, enabled: true }),
      });
      const data = (await res.json()) as {
        requiresPayment?: boolean;
        paymentUrl?: string | null;
        proRataAzn?: string;
        skipped?: boolean;
        note?: string;
      };
      if (!res.ok) {
        setErr(typeof data === "object" ? JSON.stringify(data) : await res.text());
        return;
      }
      const mod = catalog?.modules.find((m) => m.key === moduleKey);
      if (data.requiresPayment && data.paymentUrl) {
        setPayModal({
          mode: "enable",
          moduleKey,
          monthlyAzn: mod ? mod.pricePerMonth.toFixed(2) : "0.00",
          proRataAzn: data.proRataAzn ?? "0.00",
          paymentUrl: data.paymentUrl ?? undefined,
        });
        return;
      }
      if (data.note === "reactivated_before_period_end") {
        toast.success(t("subscriptionSettings.modulesUpdated"));
      } else {
        setMsg(t("subscriptionSettings.modulesUpdated"));
      }
      await refetch();
    } finally {
      setModuleBusyKey(null);
    }
  };

  const confirmDisableModule = async () => {
    if (!payModal || payModal.mode !== "disable" || !token) return;
    setModuleBusyKey(payModal.moduleKey);
    setPayModal(null);
    try {
      const res = await apiFetch("/api/billing/toggle-module", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleKey: payModal.moduleKey,
          enabled: false,
        }),
      });
      const data = (await res.json()) as { note?: string };
      if (!res.ok) {
        setErr(JSON.stringify(data));
        return;
      }
      toast.message(
        data.note === "cancellation_scheduled_end_of_month"
          ? t("billing.subscription.disableScheduled")
          : t("subscriptionSettings.modulesUpdated"),
      );
      await refetch();
    } finally {
      setModuleBusyKey(null);
    }
  };

  const onPay = async () => {
    if (!token || monthlyTotalAzn == null || monthlyTotalAzn <= 0) return;
    setPayBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await apiFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountAzn: Math.round(monthlyTotalAzn * 100) / 100,
          months: 1,
        }),
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      const data = (await res.json()) as { paymentUrl?: string };
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      setErr(t("subscriptionSettings.payNoUrl"));
    } finally {
      setPayBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="text-[#7F8C8D]">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  if (!canAccessBilling(user?.role ?? undefined)) {
    return (
      <div className="max-w-3xl space-y-4">
        <EmptyState
          title={t("billing.subscription.ownerOnlyAz")}
          description={t("subscriptionSettings.ownerOnlyBody")}
          icon={
            <Lock className="h-12 w-12 mx-auto text-[#2980B9]" aria-hidden />
          }
          action={
            <Link href="/" className={LINK_ACCENT_CLASS}>
              {t("common.backHome")}
            </Link>
          }
        />
      </div>
    );
  }

  if (!subReady) {
    return (
      <div className="max-w-3xl space-y-4">
        <p className="text-[#7F8C8D]">{t("common.loading")}</p>
      </div>
    );
  }

  if (fetchError && !effectiveSnapshot) {
    return (
      <div
        className={`max-w-3xl ${CARD_CONTAINER_CLASS} border-amber-200 bg-amber-50/90 p-8 text-center space-y-4`}
      >
        <p className="font-medium text-amber-950">{t("subscription.loadErr")}</p>
        <p className="text-sm text-amber-900/90">
          {t("subscription.loadErrHint")}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={PRIMARY_BUTTON_CLASS}
        >
          {t("common.retryCheck")}
        </button>
      </div>
    );
  }

  if (!effectiveSnapshot) {
    return (
      <div className="max-w-3xl space-y-4">
        <p className="text-[#7F8C8D]">{t("common.loading")}</p>
      </div>
    );
  }

  const switchDisabled = readOnlySub || isEnterprise;

  return (
    <div className="relative z-10 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#34495E]">
          {t("subscriptionSettings.title")}
        </h1>
        <p className="text-[13px] text-[#7F8C8D] mt-1">
          {t("subscriptionSettings.subtitleV10")}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[13px] items-center">
          <Link href="/" className={LINK_ACCENT_CLASS}>
            {t("nav.home")}
          </Link>
          <span className="text-[#D5DADF]">/</span>
          <span className="text-[#34495E]">{t("subscriptionSettings.title")}</span>
        </div>
      </div>

      {msg && (
        <p className="text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-[2px] px-3 py-2">
          {msg}
        </p>
      )}
      {err && (
        <p className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-[2px] px-3 py-2">
          {err}
        </p>
      )}

      <section className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="mt-0.5 rounded-[2px] border border-[#D5DADF] bg-[#F8F9FA] p-2">
              <Building2 className="h-6 w-6 text-[#2980B9]" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#7F8C8D]">
                {t("subscriptionSettings.currentOrganization")}
              </h2>
              <p className="text-lg font-semibold text-[#34495E] truncate">
                {currentOrg?.name ?? "—"}
              </p>
              {currentOrg?.taxId ? (
                <p className="text-[13px] text-[#7F8C8D] mt-0.5">
                  {t("subscriptionSettings.voenLabel")}: {currentOrg.taxId}
                </p>
              ) : null}
            </div>
          </div>
          <div className="text-right text-[13px] text-[#7F8C8D]">
            <div className="font-semibold uppercase tracking-wide text-amber-800">
              {t("subscriptionSettings.currentPlan")}
            </div>
            <div className="text-[#34495E] font-semibold mt-1">
              {tierLabel(effectiveSnapshot.tier)}
            </div>
            {effectiveSnapshot.isTrial && (
              <span className="inline-block mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded-[2px]">
                {t("subscriptionSettings.trial")}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-[#EBEDF0] text-[13px]">
          <div>
            <div className="text-[#7F8C8D] text-xs font-semibold uppercase tracking-wide">
              {t("subscriptionSettings.expiresAt")}
            </div>
            <div className="text-[#34495E] font-medium mt-0.5">{expiresLabel}</div>
          </div>
        </div>
      </section>

      <section className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
        <h2 className="text-lg font-semibold text-[#34495E]">
          {t("subscriptionSettings.usage")}
        </h2>
        <QuotaProgress
          label={t("subscriptionSettings.quotaEmployees")}
          current={effectiveSnapshot.quotas.employees.current}
          max={effectiveSnapshot.quotas.employees.max}
        />
        <QuotaProgress
          label={t("subscriptionSettings.quotaInvoices")}
          current={effectiveSnapshot.quotas.invoicesThisMonth.current}
          max={effectiveSnapshot.quotas.invoicesThisMonth.max}
        />
      </section>

      {readOnlySub && (
        <p className="text-[13px] text-amber-900 bg-amber-50 border border-amber-100 rounded-[2px] px-3 py-2">
          {t("subscriptionSettings.readOnlyModules")}
        </p>
      )}
      {isEnterprise && (
        <p className="text-[13px] text-[#34495E] bg-[#EBEDF0] border border-[#D5DADF] rounded-[2px] px-3 py-2">
          {t("subscriptionSettings.enterpriseAllModules")}
        </p>
      )}

      <section className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
        <div>
          <h2 className="text-lg font-semibold text-[#34495E]">
            {t("subscriptionSettings.modulesTitle")}
          </h2>
          <p className="text-[13px] text-[#7F8C8D] mt-1">
            {t("subscriptionSettings.modulesHint")}
          </p>
        </div>
        {catalogErr && (
          <p className="text-[13px] text-red-700">{catalogErr}</p>
        )}
        {!catalog && !catalogErr && (
          <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p>
        )}
        {catalog && (
          <ul className="divide-y divide-[#EBEDF0] rounded-[2px] border border-[#D5DADF] bg-white">
            {catalog.modules.map((mod) => {
              const on = isModuleOn(mod.key);
              const busy = moduleBusyKey === mod.key;
              return (
                <li
                  key={mod.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {moduleIcon(mod.key)}
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#34495E]">
                        {mod.name}
                      </div>
                      <div className="text-[12px] text-[#7F8C8D] mt-0.5 tabular-nums">
                        +{mod.pricePerMonth.toFixed(2)} AZN /{" "}
                        {t("subscriptionSettings.perMonth")}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={mod.name}
                    disabled={switchDisabled || busy}
                    onClick={() => void onToggleModule(mod.key, !on)}
                    className={[
                      "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:ring-offset-1",
                      on
                        ? "border-[#2980B9] bg-[#2980B9]"
                        : "border-[#D5DADF] bg-[#EBEDF0]",
                      switchDisabled || busy
                        ? "opacity-50 cursor-not-allowed"
                        : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transition-transform",
                        on ? "translate-x-7" : "translate-x-1",
                      ].join(" ")}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {catalog && monthlyTotalAzn != null && (
        <section
          className={`${CARD_CONTAINER_CLASS} p-6 space-y-4 border-[#2980B9]/25 bg-white`}
        >
          <h2 className="text-lg font-semibold text-[#34495E] flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[#2980B9]" aria-hidden />
            {t("subscriptionSettings.totalDueTitle")}
          </h2>
          <dl className="space-y-2 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-[#7F8C8D] text-[13px]">
                {t("subscriptionSettings.totalBase")}
              </dt>
              <dd className="tabular-nums font-medium text-[#34495E]">
                {catalog.foundationMonthlyAzn.toFixed(2)} AZN
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#7F8C8D] text-[13px]">
                {t("subscriptionSettings.totalModules")}
              </dt>
              <dd className="tabular-nums font-medium text-[#34495E]">
                {(
                  monthlyTotalAzn - catalog.foundationMonthlyAzn
                ).toFixed(2)}{" "}
                AZN
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-[#EBEDF0] pt-3 mt-1">
              <dt className="font-semibold text-[#34495E]">
                {t("subscriptionSettings.totalMonthly")}
              </dt>
              <dd className="tabular-nums text-lg font-bold text-[#2980B9]">
                {monthlyTotalAzn.toFixed(2)} AZN
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section
        className={`${CARD_CONTAINER_CLASS} p-6 space-y-4 border-dashed border-[#2980B9]/40`}
      >
        <h2 className="text-lg font-semibold text-[#34495E]">
          {t("subscriptionSettings.billingTitle")}
        </h2>
        <p className="text-[13px] text-[#7F8C8D]">
          {t("subscriptionSettings.billingMockHint")}
        </p>
        <button
          type="button"
          disabled={payBusy || readOnlySub || monthlyTotalAzn == null}
          onClick={() => void onPay()}
          className={PRIMARY_BUTTON_CLASS}
        >
          {payBusy ? "…" : t("subscriptionSettings.payButton")}
        </button>
      </section>

      <PaymentConfirmationModal
        open={payModal != null}
        mode={payModal?.mode ?? "enable"}
        monthlyAzn={payModal?.monthlyAzn ?? "0"}
        proRataAzn={payModal?.proRataAzn ?? "0"}
        onClose={() => setPayModal(null)}
        onConfirmPay={() => {
          if (!payModal) return;
          if (payModal.mode === "disable") {
            void confirmDisableModule();
            return;
          }
          if (payModal.paymentUrl) {
            window.location.href = payModal.paymentUrl;
          }
          setPayModal(null);
        }}
      />
    </div>
  );
}
