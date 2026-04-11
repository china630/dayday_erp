"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useSubscription } from "../../../lib/subscription-context";

function BillingSuccessContent() {
  const { t } = useTranslation();
  const { token, ready } = useAuth();
  const { refetch: refetchSubscription } = useSubscription();
  const search = useSearchParams();
  const orderId = search.get("orderId");
  const error = search.get("error");
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!error) {
      void refetchSubscription();
    }
  }, [error, refetchSubscription]);

  useEffect(() => {
    if (!ready || !token || !orderId || error) return;
    void (async () => {
      const res = await apiFetch(`/api/billing/orders/${orderId}`);
      if (res.ok) {
        const j = (await res.json()) as { status: string };
        setOrderStatus(j.status);
      }
    })();
  }, [ready, token, orderId, error]);

  if (error) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-4 space-y-6">
        <div className="text-5xl" aria-hidden>
          !
        </div>
        <h1 className="text-xl font-semibold text-red-800">
          {t("billingSuccess.paymentError")}
        </h1>
        <Link
          href="/admin/billing"
          className="inline-flex items-center justify-center rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-action-hover"
        >
          {t("billingSuccess.backSettings")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto text-center py-16 px-4 space-y-6">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-3xl font-bold"
        aria-hidden
      >
        ✓
      </div>
      <h1 className="text-2xl font-semibold text-gray-900">
        {t("billingSuccess.title")}
      </h1>
      <p className="text-slate-600 leading-relaxed">{t("billingSuccess.subtitle")}</p>
      {orderId && (
        <p className="text-xs text-slate-400 font-mono break-all">
          {t("billingSuccess.orderRef")}: {orderId}
        </p>
      )}
      {orderStatus && (
        <p className="text-sm text-slate-500">
          {t("billingSuccess.status")}: {orderStatus}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-action-hover"
        >
          {t("billingSuccess.backWork")}
        </Link>
        <Link
          href="/admin/billing"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          {t("billingSuccess.backSettings")}
        </Link>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto py-16 text-center text-slate-600">
          {t("common.loading")}
        </div>
      }
    >
      <BillingSuccessContent />
    </Suspense>
  );
}
