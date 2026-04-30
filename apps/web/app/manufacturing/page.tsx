"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useRequireAuth } from "../../lib/use-require-auth";
import { PageHeader } from "../../components/layout/page-header";
import { SubscriptionPaywall } from "../../components/subscription-paywall";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../../lib/design-system";

function ManufacturingHubContent() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 w-full max-w-3xl">
      <PageHeader
        title={t("manufacturing.title")}
        subtitle={t("manufacturing.hubLead")}
        actions={
          <>
            <Link href="/manufacturing/recipe" className={PRIMARY_BUTTON_CLASS}>
              + {t("manufacturing.recipes")}
            </Link>
            <Link href="/manufacturing/release" className={SECONDARY_BUTTON_CLASS}>
              + {t("manufacturing.releaseTitle")}
            </Link>
          </>
        }
      />
    </div>
  );
}

export default function ManufacturingPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;
  return (
    <SubscriptionPaywall module="manufacturing">
      <ManufacturingHubContent />
    </SubscriptionPaywall>
  );
}
