"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Building2, Wallet } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { useRequireAuth } from "../../lib/use-require-auth";
import { CARD_CONTAINER_CLASS, LINK_ACCENT_CLASS, PRIMARY_BUTTON_CLASS } from "../../lib/design-system";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/layout/page-header";
import { ledgerQueryParam, useLedger } from "../../lib/ledger-context";

type HoldingListItem = {
  id: string;
  name: string;
  baseCurrency?: string | null;
  organizations: { id: string; name: string; taxId: string; currency: string }[];
};

type HoldingSummary = {
  holdingId: string;
  holdingName: string;
  holdingBaseCurrency: string;
  fxAsOfDate: string;
  totalCashBankInHoldingBase: string | null;
  organizations: Array<{
    organizationId: string;
    organizationName: string;
    taxId: string;
    currency: string;
    cashBankBalance: string;
    cashBankInHoldingBase: string | null;
  }>;
  consolidationNote: string | null;
};

export default function HoldingDashboardPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const params = useSearchParams();
  const holdingIdFromQuery = params.get("id") ?? "";

  const [holdings, setHoldings] = useState<HoldingListItem[]>([]);
  const [holdingId, setHoldingId] = useState("");
  const [summary, setSummary] = useState<HoldingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHoldings = useCallback(async () => {
    const res = await apiFetch("/api/holdings");
    if (!res.ok) {
      setHoldings([]);
      return;
    }
    setHoldings((await res.json()) as HoldingListItem[]);
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadHoldings();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token, loadHoldings]);

  useEffect(() => {
    if (!ready || !token) return;
    if (holdingIdFromQuery) {
      setHoldingId(holdingIdFromQuery);
      return;
    }
    if (!holdingId && holdings.length > 0) {
      setHoldingId(holdings[0]!.id);
    }
  }, [ready, token, holdingIdFromQuery, holdings, holdingId]);

  const load = useCallback(async () => {
    if (!token || !holdingId) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch(
      `/api/holdings/${encodeURIComponent(holdingId)}/summary?${ledgerQueryParam(ledgerType)}`,
    );
    if (!res.ok) {
      setSummary(null);
      setError(`${t("common.loadErr")}: ${res.status}`);
      setLoading(false);
      return;
    }
    setSummary((await res.json()) as HoldingSummary);
    setLoading(false);
  }, [token, holdingId, t, ledgerType]);

  useEffect(() => {
    if (!ready || !ledgerReady || !token || !holdingId) return;
    void load();
  }, [ready, ledgerReady, token, holdingId, load]);

  const selectedHolding = useMemo(
    () => holdings.find((h) => h.id === holdingId) ?? null,
    [holdings, holdingId],
  );

  if (!ready) {
    return <div className="text-gray-600">{t("common.loading")}</div>;
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.holdingConsolidated", { defaultValue: "Holding" })}
        subtitle={t("holdingReport.subtitle", {
          defaultValue: "Konsolidasiya: şirkətlər üzrə ümumi göstəricilər.",
        })}
        actions={
          <div className="flex flex-wrap items-end justify-end gap-3">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-[#7F8C8D]">
                {t("holdingReport.holding", { defaultValue: "Holding" })}
              </span>
              <select
                className="min-w-[220px] rounded border border-[#E0E6ED] px-2 py-1.5 text-[13px]"
                value={holdingId}
                onChange={(e) => setHoldingId(e.target.value)}
              >
                {holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.organizations?.length ?? 0})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-primary hover:bg-action/10"
              onClick={() => void load()}
              disabled={!holdingId || loading}
            >
              {loading ? t("common.loading") : t("common.refresh", { defaultValue: "Yenilə" })}
            </button>
          </div>
        }
      />

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {summary ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${CARD_CONTAINER_CLASS} p-4`}>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#2980B9]" aria-hidden />
              <p className="font-semibold text-[#34495E]">
                {t("treasury.moneyTitle", { defaultValue: "Maliyyə vəsaitləri" })}
              </p>
            </div>
            <p className="mt-2 text-[13px] text-[#7F8C8D]">
              {summary.fxAsOfDate} · {summary.holdingBaseCurrency}
            </p>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-[#34495E]">
              {summary.totalCashBankInHoldingBase ?? "—"} {summary.holdingBaseCurrency}
            </p>
            {summary.consolidationNote ? (
              <p className="mt-2 text-[12px] text-amber-700">
                {summary.consolidationNote}
              </p>
            ) : null}
          </div>

          <div className={`${CARD_CONTAINER_CLASS} p-4 lg:col-span-2`}>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#2980B9]" aria-hidden />
              <p className="font-semibold text-[#34495E]">
                {selectedHolding?.name ?? summary.holdingName}
              </p>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#E0E6ED]">
                    <th className="px-3 py-2 text-left font-semibold text-[#34495E]">
                      {t("holdingReport.colOrg", { defaultValue: "Şirkət" })}
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-[#34495E]">
                      VÖEN
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-[#34495E]">
                      Cash/Bank
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-[#34495E]">
                      {summary.holdingBaseCurrency}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.organizations.map((o) => (
                    <tr key={o.organizationId} className="border-b border-[#F0F3F6]">
                      <td className="px-3 py-2 text-[#34495E]">
                        {o.organizationName}
                      </td>
                      <td className="px-3 py-2 text-[#7F8C8D]">{o.taxId}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#34495E]">
                        {o.cashBankBalance} {o.currency}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-[#34495E]">
                        {o.cashBankInHoldingBase ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-end">
              <div className="flex items-center gap-4">
                <Link
                  className="text-sm font-semibold text-action hover:underline"
                  href={`/holding/${summary.holdingId}/dashboard`}
                >
                  {t("holdingDashboard.open", {
                    defaultValue: "Open Holding Dashboard",
                  })}
                </Link>
                <Link
                  className="text-sm font-semibold text-action hover:underline"
                  href="/reporting/holding"
                >
                  {t("holdingReport.title", {
                    defaultValue: "Holding P&L hesabatı",
                  })}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : holdings.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={<Building2 className="h-12 w-12 mx-auto stroke-[1.5]" aria-hidden />}
            title={t("holdingReport.noHoldings", { defaultValue: "Holdinq yoxdur" })}
            description={t("holdingReport.noOrgsHint", {
              defaultValue: "Əvvəlcə holdinq yaradın və şirkətləri bağlayın.",
            })}
          />
          <p className="text-center text-sm text-[#7F8C8D]">
            <Link href="/companies" className={LINK_ACCENT_CLASS}>
              {t("companiesPage.title")}
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}

