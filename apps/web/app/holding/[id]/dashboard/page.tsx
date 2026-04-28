"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, ShieldAlert, Wallet } from "lucide-react";
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../lib/api-client";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { CARD_CONTAINER_CLASS } from "../../../../lib/design-system";

type HoldingBalancesSummary = {
  holdingId: string;
  holdingName: string;
  holdingBaseCurrency: string;
  fxAsOfDate: string;
  totalInHoldingBase: string | null;
  organizations: Array<{
    organizationId: string;
    organizationName: string;
    currency: string;
    amount: string;
    amountInHoldingBase: string | null;
    providers: string[];
    accountsCount: number;
  }>;
  consolidationNote: string | null;
};

type TaxRiskMonitorResponse = {
  holdingId: string;
  riskyCounterparties: Array<{
    organizationId: string;
    organizationName: string;
    counterpartyId: string;
    name: string;
    taxId: string;
    isRiskyTaxpayer: boolean | null;
  }>;
};

const PIE_COLORS = ["#2980B9", "#16A085", "#8E44AD", "#E67E22", "#C0392B", "#2C3E50"];

export default function HoldingDetailsDashboardPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const routeParams = useParams<{ id: string }>();
  const holdingId = routeParams?.id ?? "";
  const [summary, setSummary] = useState<HoldingBalancesSummary | null>(null);
  const [risk, setRisk] = useState<TaxRiskMonitorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!holdingId || !token) return;
    setLoading(true);
    setError(null);
    const [summaryRes, riskRes] = await Promise.all([
      apiFetch(`/api/holdings/${encodeURIComponent(holdingId)}/balances-summary`),
      apiFetch(`/api/holdings/${encodeURIComponent(holdingId)}/tax-risk-monitor`),
    ]);
    if (!summaryRes.ok) {
      setError(`${t("common.loadErr")}: ${summaryRes.status}`);
      setSummary(null);
      setRisk(null);
      setLoading(false);
      return;
    }
    const summaryJson = (await summaryRes.json()) as HoldingBalancesSummary;
    setSummary(summaryJson);
    if (riskRes.ok) {
      setRisk((await riskRes.json()) as TaxRiskMonitorResponse);
    } else {
      setRisk({ holdingId, riskyCounterparties: [] });
    }
    setLoading(false);
  }, [holdingId, token, t]);

  useEffect(() => {
    if (!ready || !token || !holdingId) return;
    void loadData();
  }, [ready, token, holdingId, loadData]);

  const pieData = useMemo(
    () =>
      (summary?.organizations ?? []).map((org) => ({
        name: org.organizationName,
        value: Number(org.amountInHoldingBase ?? "0"),
      })),
    [summary],
  );

  const onForceSync = async () => {
    if (!holdingId) return;
    setSyncing(true);
    setError(null);
    const res = await apiFetch(
      `/api/holdings/${encodeURIComponent(holdingId)}/sync-bank-balances`,
      {
        method: "POST",
      },
    );
    setSyncing(false);
    if (!res.ok) {
      setError(`${t("common.loadErr")}: ${res.status}`);
      return;
    }
    await loadData();
  };

  if (!ready) {
    return <div className="text-[#7F8C8D]">{t("common.loading")}</div>;
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#34495E]">
            {summary?.holdingName ?? t("nav.holdingConsolidated", { defaultValue: "Holding" })}
          </h1>
          <p className="text-[13px] text-[#7F8C8D] mt-1">
            {t("holdingReport.subtitle", {
              defaultValue: "Consolidated holding-level treasury and tax risk monitoring.",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-[#D5DADF] px-3 py-2 text-sm font-semibold text-[#34495E] hover:bg-[#F8F9FA]"
            disabled={loading}
          >
            {loading ? t("common.loading") : t("common.refresh", { defaultValue: "Refresh" })}
          </button>
          <button
            type="button"
            onClick={() => void onForceSync()}
            className="inline-flex items-center gap-2 rounded-lg bg-action px-3 py-2 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-70"
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            {t("holdingDashboard.syncBanks", { defaultValue: "Синхронизировать банки" })}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className={`${CARD_CONTAINER_CLASS} p-5`}>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-[#2980B9]" aria-hidden />
          <h2 className="text-lg font-semibold text-[#34495E]">
            {t("holdingDashboard.cashBankWidget", {
              defaultValue: "Cash & Bank across Holding",
            })}
          </h2>
        </div>
        <p className="text-[13px] text-[#7F8C8D] mt-1">
          {summary?.fxAsOfDate ?? "—"} · {summary?.holdingBaseCurrency ?? "AZN"}
        </p>
        <p className="text-2xl font-bold tabular-nums text-[#34495E] mt-3">
          {summary?.totalInHoldingBase ?? "—"} {summary?.holdingBaseCurrency ?? "AZN"}
        </p>
        {summary?.consolidationNote ? (
          <p className="text-[12px] text-amber-700 mt-2">{summary.consolidationNote}</p>
        ) : null}

        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100} label>
                {pieData.map((entry, idx) => (
                  <Cell key={`${entry.name}-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={`${CARD_CONTAINER_CLASS} p-5`}>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden />
          <h2 className="text-lg font-semibold text-[#34495E]">
            {t("holdingDashboard.taxRiskMonitor", {
              defaultValue: "Tax Risk Monitor",
            })}
          </h2>
        </div>
        {(risk?.riskyCounterparties.length ?? 0) === 0 ? (
          <p className="mt-3 text-[13px] text-[#7F8C8D]">
            {t("holdingDashboard.taxRiskEmpty", {
              defaultValue: "No risky counterparties detected in the latest check.",
            })}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E0E6ED]">
                  <th className="px-3 py-2 text-left font-semibold text-[#34495E]">
                    {t("holdingDashboard.org", { defaultValue: "Organization" })}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-[#34495E]">
                    {t("holdingDashboard.counterparty", { defaultValue: "Counterparty" })}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold text-[#34495E]">VÖEN</th>
                  <th className="px-3 py-2 text-left font-semibold text-[#34495E]">
                    {t("holdingDashboard.riskStatus", { defaultValue: "Risk status" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {risk?.riskyCounterparties.map((row) => (
                  <tr key={row.counterpartyId} className="border-b border-[#F0F3F6]">
                    <td className="px-3 py-2">{row.organizationName}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 tabular-nums">{row.taxId}</td>
                    <td className="px-3 py-2 text-amber-700 font-semibold">
                      {row.isRiskyTaxpayer ? "Risky" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm text-[#7F8C8D]">
        <Link href="/holding" className="text-action hover:underline">
          {t("common.back", { defaultValue: "Back" })}
        </Link>
      </p>
    </div>
  );
}

