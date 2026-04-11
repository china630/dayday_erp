"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useRequireAuth } from "../../lib/use-require-auth";
import { ModulePageLinks } from "../../components/module-page-links";
import { SubscriptionPaywall } from "../../components/subscription-paywall";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

function ManufacturingHubContent() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 w-full max-w-3xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/inventory", labelKey: "nav.inventory" },
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-[#34495E]">{t("manufacturing.title")}</h1>
        <p className="text-sm text-[#7F8C8D] mt-2">{t("manufacturing.hubLead")}</p>
      </div>
      <div className={`${CARD_CONTAINER_CLASS} p-6`}>
        <div className="flex flex-wrap gap-3">
          <Link href="/manufacturing/recipe" className={PRIMARY_BUTTON_CLASS}>
            + {t("manufacturing.recipes")}
          </Link>
          <Link href="/manufacturing/release" className={SECONDARY_BUTTON_CLASS}>
            + {t("manufacturing.releaseTitle")}
          </Link>
        </div>
      </div>
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
