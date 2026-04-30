"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../../lib/form-styles";
import { formatMoneyAzn } from "../../../lib/format-money";

type BsLine = { code: string; name: string; amount: string };

type BalanceSheetPayload = {
  asOfDate: string;
  assets: BsLine[];
  liabilities: BsLine[];
  equity: BsLine[];
  totals: {
    assets: string;
    liabilities: string;
    equity: string;
    liabilitiesEquity: string;
  };
  cached?: boolean;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(v: unknown): string {
  return formatMoneyAzn(v).replace("₼", "").trim();
}

export default function BalanceSheetPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [asOf, setAsOf] = useState(() => todayUtc());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<BalanceSheetPayload | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    setData(null);
    const qs = new URLSearchParams({ asOfDate: asOf });
    const res = await apiFetch(`/api/reports/balance-sheet?${qs.toString()}`);
    setLoading(false);
    if (!res.ok) {
      setErr(`${t("reports.balanceSheet.err")}: ${res.status}`);
      return;
    }
    setData((await res.json()) as BalanceSheetPayload);
  }, [token, asOf, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [ready, token, load]);

  const renderSide = useMemo(
    () =>
      (title: string, rows: BsLine[], total: string) => (
        <div className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
          <div className="border-b border-[#D5DADF] bg-[#F8F9FA] px-4 py-3 text-[13px] font-semibold text-[#34495E]">
            {title}
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#EBEDF0]">
                <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                  {t("reports.balanceSheet.thLine")}
                </th>
                <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] tabular-nums">
                  {t("reports.balanceSheet.thAmount")} (₼)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t border-[#EBEDF0]">
                  <td className="p-2 text-[#34495E]">
                    <span className="font-medium">{r.name}</span>
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {fmt(r.amount)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[#D5DADF] bg-white">
                <td className="p-2 font-semibold text-[#34495E]">
                  {t("reports.balanceSheet.total")}
                </td>
                <td className="p-2 text-right font-mono tabular-nums font-semibold text-[#34495E]">
                  {fmt(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ),
    [t],
  );

  if (!ready) return <div className="text-gray-600">{t("common.loading")}</div>;
  if (!token) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reports.balanceSheet.title")}
        subtitle={t("reports.balanceSheet.hint")}
        actions={
          <div className={`${CARD_CONTAINER_CLASS} flex flex-wrap items-end gap-3 p-4`}>
          <label className="flex flex-col gap-1">
            <span className={FORM_LABEL_CLASS}>{t("reports.balanceSheet.asOf")}</span>
            <input
              type="date"
              className={FORM_INPUT_CLASS}
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "…" : t("reports.balanceSheet.load")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            disabled={loading}
            onClick={() => setAsOf(todayUtc())}
          >
            {t("common.today")}
          </button>
        </div>
        }
      />

      {err ? <div className="text-sm text-red-600">{err}</div> : null}

      {!data ? null : (
        <div className="grid gap-4 lg:grid-cols-2">
          {renderSide(
            t("reports.balanceSheet.assets"),
            data.assets,
            data.totals.assets,
          )}
          <div className="space-y-4">
            {renderSide(
              t("reports.balanceSheet.liabilities"),
              data.liabilities,
              data.totals.liabilities,
            )}
            {renderSide(
              t("reports.balanceSheet.equity"),
              data.equity,
              data.totals.equity,
            )}
            <div className={`${CARD_CONTAINER_CLASS} p-4 flex items-center justify-between`}>
              <div className="text-sm font-semibold text-[#34495E]">
                {t("reports.balanceSheet.liabilitiesEquity")}
              </div>
              <div className="text-sm font-mono tabular-nums font-semibold text-[#34495E]">
                {fmt(data.totals.liabilitiesEquity)}
                {data.cached ? ` · ${t("reports.cached")}` : ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

