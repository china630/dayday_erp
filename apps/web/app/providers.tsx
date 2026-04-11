"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "../lib/i18n/client-i18n";
import { AuthProvider } from "../lib/auth-context";
import { LedgerProvider } from "../lib/ledger-context";
import { SubscriptionProvider } from "../lib/subscription-context";
import { Toaster } from "sonner";
import { UpgradeRequiredModalHost } from "../components/upgrade-required-modal";
import { I18nOverridesLoader } from "../components/i18n-overrides-loader";
import { ApiErrorToaster } from "../components/api-error-toaster";

function HtmlLangSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language.startsWith("az") ? "az" : "ru";
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
  // Prevent hydration mismatch caused by client-only sources (localStorage,
  // sessionStorage, i18next language detector) that differ between SSR and
  // first client render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <HtmlLangSync />
      <SeoHeadSync />
      <I18nOverridesLoader />
      <AuthProvider>
        <SubscriptionProvider>
          <UpgradeRequiredModalHost />
          <ApiErrorToaster />
          <Toaster richColors position="top-right" closeButton />
          <LedgerProvider>{children}</LedgerProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}
