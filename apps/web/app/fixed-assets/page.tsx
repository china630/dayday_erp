"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { formatMoneyAzn } from "../../lib/format-money";
import { useRequireAuth } from "../../lib/use-require-auth";
import { useAuth } from "../../lib/auth-context";
import { isRestrictedUserRole } from "../../lib/role-utils";
import { EmptyState } from "../../components/empty-state";
import { ModulePageLinks } from "../../components/module-page-links";
import { SubscriptionPaywall } from "../../components/subscription-paywall";
import {
  BORDER_MUTED_CLASS,
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../lib/design-system";

type Fa = {
  id: string;
  name: string;
  inventoryNumber: string;
  commissioningDate: string;
  initialCost: unknown;
  usefulLifeMonths: number;
  salvageValue: unknown;
  bookedDepreciation: unknown;
};

function FixedAssetsPageContent() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const hideDestructive = isRestrictedUserRole(user?.role ?? undefined);
  const [rows, setRows] = useState<Fa[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await apiFetch("/api/fixed-assets");
    if (!res.ok) {
      setErr(`${t("fixedAssets.loadErr")}: ${res.status}`);
      setRows([]);
    } else {
      setRows(await res.json());
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    const onOnline = () => {
      void load();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  async function remove(id: string) {
    if (!token || !window.confirm("OK?")) return;
    const res = await apiFetch(`/api/fixed-assets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    await load();
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/reporting", labelKey: "nav.reportingHub" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-[#34495E]">{t("fixedAssets.title")}</h1>
        <Link href="/fixed-assets/new" className={PRIMARY_BUTTON_CLASS}>
          + {t("fixedAssets.newBtn")}
        </Link>
      </div>
      {err && (
        <div className="rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-red-800 text-sm m-0">{err}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-sm font-medium text-red-900 hover:bg-red-50"
          >
            {t("common.retryCheck")}
          </button>
        </div>
      )}

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && rows.length === 0 && !err && (
        <div className="flex min-h-[320px] w-full flex-col items-center justify-center py-8">
          <EmptyState
            className="max-w-lg w-full border-[#D5DADF] bg-white"
            icon={
              <Building2
                className="mx-auto h-12 w-12 stroke-[1.5] text-[#7F8C8D]"
                aria-hidden
              />
            }
            title={t("fixedAssets.emptyTitle")}
            description={t("fixedAssets.emptyHint")}
          />
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`${CARD_CONTAINER_CLASS} space-y-1 p-4 text-sm`}
              >
                <div className="font-medium text-[#34495E]">{r.name}</div>
                <div>
                  {t("fixedAssets.invNo")}: {r.inventoryNumber}
                </div>
                <div>
                  {t("fixedAssets.initial")}: {formatMoneyAzn(r.initialCost)}
                </div>
                <div>
                  {t("fixedAssets.thBooked")}: {formatMoneyAzn(r.bookedDepreciation)}
                </div>
                {!hideDestructive && (
                  <button
                    type="button"
                    className="text-red-700 text-xs mt-2 border border-red-200 px-2 py-1 rounded-md"
                    onClick={() => void remove(r.id)}
                  >
                    {t("fixedAssets.delete")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div
            className={`hidden overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm md:block`}
          >
            <table className="min-w-[640px] text-sm">
              <thead>
                <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                  <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                    {t("fixedAssets.thName")}
                  </th>
                  <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                    {t("fixedAssets.thInv")}
                  </th>
                  <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                    {t("fixedAssets.commission")}
                  </th>
                  <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">
                    {t("fixedAssets.initial")}
                  </th>
                  <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">
                    {t("fixedAssets.life")}
                  </th>
                  <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]">
                    {t("fixedAssets.thBooked")}
                  </th>
                  {!hideDestructive ? (
                    <th className="p-2 text-right text-[13px] font-semibold text-[#34495E]" />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                    <td>{r.name}</td>
                    <td>{r.inventoryNumber}</td>
                    <td>{String(r.commissioningDate).slice(0, 10)}</td>
                    <td>{formatMoneyAzn(r.initialCost)}</td>
                    <td>{r.usefulLifeMonths}</td>
                    <td>{formatMoneyAzn(r.bookedDepreciation)}</td>
                    {!hideDestructive && (
                      <td>
                        <button
                          type="button"
                          className="text-red-700 text-xs border border-red-200 px-2 py-1 rounded-md"
                          onClick={() => void remove(r.id)}
                        >
                          {t("fixedAssets.delete")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function FixedAssetsPage() {
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
    <SubscriptionPaywall module="fixedAssets">
      <FixedAssetsPageContent />
    </SubscriptionPaywall>
  );
}
