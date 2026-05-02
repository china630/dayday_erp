"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "../lib/i18n/client-i18n";
import { AuthProvider } from "../lib/auth-context";
import { LedgerPeriodLockProvider } from "../lib/ledger-period-lock-context";
import { LedgerProvider } from "../lib/ledger-context";
import { SubscriptionProvider } from "../lib/subscription-context";
import { Toaster } from "sonner";
import { UpgradePlanModalHost } from "../components/upgrade-required-modal";
import { I18nOverridesLoader } from "../components/i18n-overrides-loader";
import { ApiErrorToaster } from "../components/api-error-toaster";
import { NetworkErrorToaster } from "../components/network-error-toaster";
import { uiLangRuAz } from "../lib/i18n/ui-lang";

function HtmlLangSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = uiLangRuAz(i18n.language);
  }, [i18n.language]);
  return null;
}

function SeoHeadSync() {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.title = t("seo.title");
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", t("seo.description"));
  }, [i18n.language, t]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [i18nReady, setI18nReady] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (i18n.isInitialized) {
      setI18nReady(true);
      return;
    }
    const onInit = () => setI18nReady(true);
    i18n.on("initialized", onInit);
    return () => {
      i18n.off("initialized", onInit);
    };
  }, [mounted]);

  if (!mounted || !i18nReady) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <HtmlLangSync />
      <SeoHeadSync />
      <I18nOverridesLoader />
      <AuthProvider>
        <SubscriptionProvider>
          <UpgradePlanModalHost />
          <ApiErrorToaster />
          <NetworkErrorToaster />
          <Toaster richColors position="top-right" closeButton />
          <LedgerPeriodLockProvider>
            <LedgerProvider>{children}</LedgerProvider>
          </LedgerPeriodLockProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}
