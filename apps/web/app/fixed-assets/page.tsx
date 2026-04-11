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
import { PRIMARY_BUTTON_CLASS } from "../../lib/design-system";

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
        <div className="flex min-h-[280px] items-center justify-center">
          <div className="w-full max-w-lg">
            <EmptyState
              icon={<Building2 className="h-12 w-12 mx-auto stroke-[1.5]" aria-hidden />}
              title={t("fixedAssets.emptyTitle")}
              description={t("fixedAssets.emptyHint")}
            />
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm text-sm space-y-1"
              >
                <div className="font-medium text-gray-900">{r.name}</div>
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
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="text-sm min-w-[640px]">
              <thead>
                <tr>
                  <th>{t("fixedAssets.thName")}</th>
                  <th>{t("fixedAssets.thInv")}</th>
                  <th>{t("fixedAssets.commission")}</th>
                  <th>{t("fixedAssets.initial")}</th>
                  <th>{t("fixedAssets.life")}</th>
                  <th>{t("fixedAssets.thBooked")}</th>
                  {!hideDestructive && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
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
