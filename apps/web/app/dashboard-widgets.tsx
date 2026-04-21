"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../lib/api-client";
import { useAuth } from "../lib/auth-context";
import { canCloseAccountingPeriod } from "../lib/role-utils";
import { ledgerQueryParam, useLedger } from "../lib/ledger-context";
import { MoneyAzn } from "../lib/money-azn";
import { EmptyState } from "../components/empty-state";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../lib/design-system";

const FX_FLAGS: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  RUB: "🇷🇺",
  CNY: "🇨🇳",
  TRY: "🇹🇷",
  JPY: "🇯🇵",
};

const DASH_TH =
  "text-[13px] font-semibold text-[#34495E] border-b border-[#EBEDF0] bg-[#F8F9FA]";

type ClosePeriodPromptPayload = {
  show: boolean;
  year: number | null;
  month: number | null;
  periodKey: string | null;
};

type MiniFinancialsPayload = {
  periodLabel: string;
  plNetProfit: string;
  totalAssets: string;
  totalLiabilitiesEquity: string;
  cashFlowMonth: string;
};

type ExecutiveWidgetsPayload = {
  periodLabel: string;
  totalCash: string;
  receivables: string;
  vendorPayables: string;
  salariesAndTaxesPayables: string;
  netProfitMtd: string;
};

type DashboardPayload = {
  ledgerType?: string;
  cashBankBalance: string;
  obligations521531Balance: string;
  currentMonthExpense721: string;
  topProducts: {
    productId: string | null;
    name: string;
    sku: string;
    quantity: string;
  }[];
  revenueByDay: { date: string; amount: string }[];
  topDebtors: { counterpartyId: string; name: string; balance: string }[];
  topCreditors: { counterpartyId: string; name: string; balance: string }[];
};

function utcDayKeys(last = 29): string[] {
  const out: string[] = [];
  const t = new Date();
  for (let i = last; i >= 0; i--) {
    const d = new Date(
      Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - i),
    );
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function IconCash() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7.5C4 6.11929 5.11929 5 6.5 5H20V19.5C20 20.8807 18.8807 22 17.5 22H6.5C5.11929 22 4 20.8807 4 19.5V7.5Z"
        stroke="#2980B9"
        strokeWidth="1.6"
      />
      <path
        d="M7.2 10.2H16.8"
        stroke="#2980B9"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7.2 14.1H13.6"
        stroke="#2980B9"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconExpense721() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 4h10v4H7V4zM6 9h12v11H6V9z"
        stroke="#b45309"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 13h6M9 16h4"
        stroke="#b45309"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTax() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M8 7.5C8 6.11929 9.11929 5 10.5 5H18V19.5C18 20.8807 16.8807 22 15.5 22H10.5C9.11929 22 8 20.8807 8 19.5V7.5Z"
        stroke="#2980B9"
        strokeWidth="1.6"
      />
      <path
        d="M4.5 9H7.9"
        stroke="#2980B9"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4.5 13H7.1"
        stroke="#2980B9"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

type FxDashboardRateRow = {
  currencyCode: string;
  rate: number | null;
  rateDateBaku: string | null;
  isFallback: boolean;
  isUnavailable: boolean;
};

type FxRatesPayload = {
  rates: FxDashboardRateRow[];
  isFallback: boolean;
};

export function DashboardWidgets() {
  const { t } = useTranslation();
  const { token, ready, user } = useAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [closeYear, setCloseYear] = useState(new Date().getUTCFullYear());
  const [closeMonth, setCloseMonth] = useState(new Date().getUTCMonth() + 1);
  const [closing, setClosing] = useState(false);
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<FxRatesPayload | null>(null);
  const [fxErr, setFxErr] = useState<string | null>(null);
  const [closePrompt, setClosePrompt] = useState<ClosePeriodPromptPayload | null>(
    null,
  );
  const [miniFin, setMiniFin] = useState<MiniFinancialsPayload | null>(null);
  const [miniFinErr, setMiniFinErr] = useState<string | null>(null);
  const [exec, setExec] = useState<ExecutiveWidgetsPayload | null>(null);
  const [execErr, setExecErr] = useState<string | null>(null);
  const canClose = canCloseAccountingPeriod(user?.role ?? undefined);

  const load = useCallback(async () => {
    if (!token) {
      setError(null);
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch(
      `/api/reporting/dashboard?${ledgerQueryParam(ledgerType)}`,
    );
    if (!res.ok) {
      setError(t("dashboard.dashErr", { status: String(res.status) }));
      setData(null);
    } else {
      setData((await res.json()) as DashboardPayload);
    }
    setLoading(false);
  }, [token, t, ledgerType]);

  const loadFx = useCallback(async () => {
    if (!token) {
      setFxRates(null);
      return;
    }
    setFxErr(null);
    const res = await apiFetch("/api/fx/rates");
    if (!res.ok) {
      setFxErr(t("dashboard.fxErr", { status: String(res.status) }));
      setFxRates(null);
      return;
    }
    setFxRates((await res.json()) as FxRatesPayload);
  }, [token, t]);

  const loadClosePrompt = useCallback(async () => {
    if (!token) {
      setClosePrompt(null);
      return;
    }
    const res = await apiFetch("/api/reporting/close-period-prompt");
    if (!res.ok) {
      setClosePrompt(null);
      return;
    }
    const p = (await res.json()) as ClosePeriodPromptPayload;
    setClosePrompt(p);
    if (p.show && p.year != null && p.month != null) {
      setCloseYear(p.year);
      setCloseMonth(p.month);
    }
  }, [token]);

  const loadMiniFin = useCallback(async () => {
    if (!token) {
      setMiniFin(null);
      return;
    }
    setMiniFinErr(null);
    const res = await apiFetch(
      `/api/reporting/dashboard-mini?${ledgerQueryParam(ledgerType)}`,
    );
    if (!res.ok) {
      setMiniFinErr(t("dashboard.miniErr", { status: String(res.status) }));
      setMiniFin(null);
      return;
    }
    setMiniFin((await res.json()) as MiniFinancialsPayload);
  }, [token, t, ledgerType]);

  const loadExec = useCallback(async () => {
    if (!token) {
      setExec(null);
      return;
    }
    setExecErr(null);
    const res = await apiFetch(`/api/reports/executive-widgets?${ledgerQueryParam(ledgerType)}`);
    if (!res.ok) {
      setExecErr(t("dashboard.miniErr", { status: String(res.status) }));
      setExec(null);
      return;
    }
    setExec((await res.json()) as ExecutiveWidgetsPayload);
  }, [token, t, ledgerType]);

  useEffect(() => {
    if (!ready || !ledgerReady) return;
    void load();
    void loadMiniFin();
    void loadExec();
  }, [load, loadMiniFin, loadExec, ready, ledgerReady]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadFx();
    void loadClosePrompt();
  }, [loadFx, loadClosePrompt, ready, token]);

  const chartData = useMemo(() => {
    const keys = utcDayKeys(29);
    const map = new Map(
      (data?.revenueByDay ?? []).map((r) => [r.date, Number(r.amount)]),
    );
    return keys.map((date) => ({
      date: date.slice(5),
      amount: map.get(date) ?? 0,
    }));
  }, [data]);

  async function closePeriod() {
    if (!token) return;
    setClosing(true);
    setCloseMsg(null);
    const res = await apiFetch("/api/reporting/close-period", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: closeYear, month: closeMonth }),
    });
    setClosing(false);
    if (!res.ok) {
      const text = await res.text();
      setCloseMsg(
        t("dashboard.closeErr", {
          status: String(res.status),
          detail: text || "—",
        }),
      );
      return;
    }
    const j = (await res.json()) as {
      closedPeriod?: string;
      depreciation?: {
        transactionId: string | null;
        totalAmount: string;
        assetsCount: number;
      };
    };
    let msg = t("dashboard.closeOk", { period: j.closedPeriod ?? "—" });
    if (j.depreciation) {
      if (
        j.depreciation.assetsCount > 0 &&
        Number(j.depreciation.totalAmount) > 0
      ) {
        msg += ` ${t("dashboard.closeDepr", {
          amount: j.depreciation.totalAmount,
          count: String(j.depreciation.assetsCount),
        })}`;
      } else {
        msg += ` ${t("dashboard.closeDeprNone")}`;
      }
    }
    setCloseMsg(msg);
    await loadClosePrompt();
    void load();
    void loadMiniFin();
  }

  if (!ready || !ledgerReady) {
    return (
        <section className="mt-8">
          <p>{t("common.loading")}</p>
        </section>
    );
  }

  if (!token) {
    return (
      <section className="mt-8 text-gray-600">
        {t("dashboard.authRequired")}
      </section>
    );
  }

  return (
    <section className="mt-2">
      {closePrompt?.show && closePrompt.periodKey ? (
        <div
          id="close-period-section"
          className="mb-6 scroll-mt-24 rounded-[2px] border border-amber-100/90 bg-amber-50/85 px-4 py-3.5 shadow-sm"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug text-[#34495E]">
                {t("dashboard.closePeriodPromptTitle", {
                  period: closePrompt.periodKey,
                })}
              </h3>
              <p className="mt-1 text-[12px] leading-relaxed text-[#7F8C8D]">
                {t("dashboard.closePeriodPromptHint")}
              </p>
            </div>
            {canClose ? (
              <div className="flex flex-wrap items-end gap-3 lg:ml-4 lg:shrink-0">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-[#7F8C8D]">{t("dashboard.year")}</span>
                  <input
                    type="number"
                    value={closeYear}
                    onChange={(e) => setCloseYear(Number(e.target.value))}
                    className={`${INPUT_BORDERED_CLASS} w-28 py-1.5`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] text-[#7F8C8D]">{t("dashboard.month")}</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={closeMonth}
                    onChange={(e) => setCloseMonth(Number(e.target.value))}
                    className={`${INPUT_BORDERED_CLASS} w-24 py-1.5`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void closePeriod()}
                  disabled={closing}
                  className={`${PRIMARY_BUTTON_CLASS} lg:ml-1`}
                >
                  {closing ? t("dashboard.closing") : t("dashboard.closeBtn")}
                </button>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[#7F8C8D] lg:max-w-sm">
                {t("dashboard.closePeriodNoRole")}
              </p>
            )}
          </div>
          {closeMsg ? (
            <p className="mt-3 border-t border-amber-100/80 pt-3 text-[13px] text-[#34495E]">
              {closeMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={`${CARD_CONTAINER_CLASS} mb-6 p-5`}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{t("dashboard.fxTitle")}</h3>
        <p className="text-xs text-gray-500 mb-3">{t("dashboard.fxHint")}</p>
        {fxErr && <p className="text-red-600 text-sm mb-2">{fxErr}</p>}
        {fxRates && !fxErr && (
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:justify-start">
            {fxRates.rates.map((r) => (
              <div
                key={r.currencyCode}
                className="w-full min-w-0 rounded-lg border border-[#D5DADF] bg-[#F8F9FA] px-3 py-2.5 lg:w-auto lg:min-w-[120px] lg:flex-none"
              >
                <div className="text-gray-600 mb-1 text-xs flex items-center gap-1.5">
                  <span className="text-base leading-none" aria-hidden>
                    {FX_FLAGS[r.currencyCode] ?? "🏳️"}
                  </span>
                  <span className="font-semibold">{r.currencyCode}</span>
                  <span className="text-gray-400 font-normal">/ AZN</span>
                </div>
                <div className="text-lg font-semibold text-gray-900 tabular-nums">
                  {r.rate != null && !Number.isNaN(r.rate)
                    ? r.rate.toFixed(4)
                    : "—"}
                </div>
                <div className="text-[11px] text-gray-500 mt-1 leading-tight">
                  {r.rateDateBaku ?? "—"}
                  {r.isFallback && r.rate != null
                    ? ` · ${t("dashboard.fxFallback")}`
                    : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {error && <p className="text-red-400">{error}</p>}
      {data && !loading && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
            <div className={`${CARD_CONTAINER_CLASS} flex min-h-[148px] flex-col p-5`}>
              <div className="flex flex-1 flex-col justify-between gap-2">
                <div className="text-[13px] text-[#7F8C8D] flex items-center gap-2">
                  <IconCash />
                  {t("dashboard.cash")}
                </div>
                <MoneyAzn
                  value={data.cashBankBalance}
                  className="text-2xl font-semibold text-[#34495E]"
                />
              </div>
            </div>

            <div className={`${CARD_CONTAINER_CLASS} flex min-h-[148px] flex-col p-5`}>
              <div className="flex flex-1 flex-col justify-between gap-2">
                <div className="text-[13px] text-[#7F8C8D] flex items-center gap-2">
                  <IconTax />
                  {t("dashboard.payables521531Title")}
                </div>
                <MoneyAzn
                  value={data.obligations521531Balance}
                  className="text-2xl font-semibold text-[#34495E]"
                />
              </div>
            </div>

            <div className={`${CARD_CONTAINER_CLASS} flex min-h-[148px] flex-col p-5`}>
              <div className="flex flex-1 flex-col justify-between gap-2">
                <div>
                  <div className="text-[13px] text-[#7F8C8D] mb-1 flex items-center gap-2">
                    <IconExpense721 />
                    {t("dashboard.currentMonthExpenses721")}
                  </div>
                  <p className="text-[11px] text-[#7F8C8D]/90 mb-1 leading-snug">
                    {t("dashboard.currentMonthExpenses721Hint")}
                  </p>
                </div>
                <MoneyAzn
                  value={data.currentMonthExpense721}
                  className="text-2xl font-semibold text-[#34495E]"
                />
              </div>
            </div>
          </div>

          {execErr && (
            <p className="text-amber-700 text-sm mb-4">{execErr}</p>
          )}
          {exec && !execErr && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:items-stretch">
              <Link
                href="/reports/balance-sheet"
                className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5 hover:bg-[#F4F5F7] transition-colors`}
              >
                <p className="mb-1 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniPeriod", { period: exec.periodLabel })}
                </p>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.execTotalCash")}
                </h3>
                <MoneyAzn
                  value={exec.totalCash}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </Link>
              <Link
                href="/reporting/receivables"
                className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5 hover:bg-[#F4F5F7] transition-colors`}
              >
                <p className="mb-1 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniPeriod", { period: exec.periodLabel })}
                </p>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.execReceivables")}
                </h3>
                <MoneyAzn
                  value={exec.receivables}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </Link>
              <Link
                href="/reports/balance-sheet"
                className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5 hover:bg-[#F4F5F7] transition-colors`}
              >
                <p className="mb-1 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniPeriod", { period: exec.periodLabel })}
                </p>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.execVendorPayables")}
                </h3>
                <p className="mb-2 text-[11px] leading-snug text-[#7F8C8D]">
                  {t("dashboard.execVendorPayablesHint")}
                </p>
                <MoneyAzn
                  value={exec.vendorPayables}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </Link>
              <Link
                href="/reports/balance-sheet"
                className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5 hover:bg-[#F4F5F7] transition-colors`}
              >
                <p className="mb-1 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniPeriod", { period: exec.periodLabel })}
                </p>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.execSalariesTaxesPayables")}
                </h3>
                <p className="mb-2 text-[11px] leading-snug text-[#7F8C8D]">
                  {t("dashboard.execSalariesTaxesPayablesHint")}
                </p>
                <MoneyAzn
                  value={exec.salariesAndTaxesPayables}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </Link>
              <Link
                href="/reporting"
                className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5 hover:bg-[#F4F5F7] transition-colors`}
              >
                <p className="mb-1 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniPeriod", { period: exec.periodLabel })}
                </p>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.execNetProfitMtd")}
                </h3>
                <MoneyAzn
                  value={exec.netProfitMtd}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </Link>
            </div>
          )}

          {miniFinErr && (
            <p className="text-amber-700 text-sm mb-4">{miniFinErr}</p>
          )}
          {miniFin && !miniFinErr && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
              <div className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5`}>
                <p className="mb-1 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniPeriod", { period: miniFin.periodLabel })}
                </p>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.miniPI")}
                </h3>
                <p className="mb-2 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniPIHint")}
                </p>
                <MoneyAzn
                  value={miniFin.plNetProfit}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </div>
              <div className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5`}>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.miniAssets")}
                </h3>
                <p className="mb-2 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniBalanceHint")}
                </p>
                <MoneyAzn
                  value={miniFin.totalAssets}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </div>
              <div className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5`}>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.miniLiabEq")}
                </h3>
                <p className="mb-2 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniBalanceHint")}
                </p>
                <MoneyAzn
                  value={miniFin.totalLiabilitiesEquity}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </div>
              <div className={`${CARD_CONTAINER_CLASS} flex min-h-[132px] flex-col p-5`}>
                <h3 className="mb-2 text-[13px] font-semibold text-[#34495E]">
                  {t("dashboard.miniCashFlow")}
                </h3>
                <p className="mb-2 text-[11px] text-[#7F8C8D]">
                  {t("dashboard.miniCashFlowHint")}
                </p>
                <MoneyAzn
                  value={miniFin.cashFlowMonth}
                  className="mt-auto text-xl font-semibold text-[#34495E]"
                />
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={`${CARD_CONTAINER_CLASS} min-w-0 p-5`}>
              <h3 className="mb-1 text-lg font-semibold text-[#34495E]">
                {t("dashboard.topDebtors")}
              </h3>
              <p className="mb-3 text-[13px] text-[#7F8C8D]">{t("dashboard.topDebtorsHint")}</p>
              <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full text-[13px] text-[#34495E]">
                <thead>
                  <tr>
                    <th className={`${DASH_TH} text-left py-2.5 pl-3 pr-2`}>
                      {t("dashboard.thCpName")}
                    </th>
                    <th className={`${DASH_TH} py-2.5 pr-3 text-right`}>
                      {t("dashboard.thBalance")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data.topDebtors ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-0">
                        <EmptyState compact title={t("dashboard.noData")} className="border-0 bg-transparent shadow-none" />
                      </td>
                    </tr>
                  ) : (
                    (data.topDebtors ?? []).map((r) => (
                      <tr key={r.counterpartyId} className="border-t border-[#EBEDF0]">
                        <td className="py-2.5 pl-3 pr-2">{r.name}</td>
                        <td className="py-2.5 pr-3 text-right font-mono">
                          <MoneyAzn value={r.balance} className="text-[#34495E]" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
            <div className={`${CARD_CONTAINER_CLASS} min-w-0 p-5`}>
              <h3 className="mb-1 text-lg font-semibold text-[#34495E]">
                {t("dashboard.topCreditors")}
              </h3>
              <p className="mb-3 text-[13px] text-[#7F8C8D]">{t("dashboard.topCreditorsHint")}</p>
              <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full text-[13px] text-[#34495E]">
                <thead>
                  <tr>
                    <th className={`${DASH_TH} text-left py-2.5 pl-3 pr-2`}>
                      {t("dashboard.thCpName")}
                    </th>
                    <th className={`${DASH_TH} py-2.5 pr-3 text-right`}>
                      {t("dashboard.thBalance")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data.topCreditors ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-0">
                        <EmptyState compact title={t("dashboard.noData")} className="border-0 bg-transparent shadow-none" />
                      </td>
                    </tr>
                  ) : (
                    (data.topCreditors ?? []).map((r) => (
                      <tr key={r.counterpartyId} className="border-t border-[#EBEDF0]">
                        <td className="py-2.5 pl-3 pr-2">{r.name}</td>
                        <td className="py-2.5 pr-3 text-right font-mono">
                          <MoneyAzn value={r.balance} className="text-[#34495E]" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <div className={`${CARD_CONTAINER_CLASS} mb-6 min-w-0 p-5`}>
            <h3 className="mb-2 text-lg font-semibold text-[#34495E]">
              {t("dashboard.revenue")}
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2980B9" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#2980B9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEDF0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#7F8C8D" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#7F8C8D" }} width={56} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const value = (payload[0] as { value: number }).value;
                      return (
                        <div className="rounded-[2px] border border-[#D5DADF] bg-white px-3 py-2 text-[13px] shadow-sm">
                          <div className="text-[#7F8C8D]">
                            {t("dashboard.dateLabel")} {label}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[#34495E]">
                              {t("dashboard.revenueTooltip")}:
                            </span>
                            <MoneyAzn value={value} className="font-semibold text-[#34495E]" />
                          </div>
                        </div>
                      );
                    }}
                    labelFormatter={(l) => l}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#2980B9"
                    strokeWidth={2}
                    fill="url(#revFill)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${CARD_CONTAINER_CLASS} mb-6 min-w-0 p-5`}>
            <h3 className="mb-2 text-lg font-semibold text-[#34495E]">
              {t("dashboard.topProducts")}
            </h3>
            <p className="mb-4 text-[13px] text-[#7F8C8D]">
              {t("dashboard.topProductsHint")}
            </p>
            <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className={`${DASH_TH} text-left py-2.5 pl-3 pr-2`}>
                    {t("dashboard.productCol")}
                  </th>
                  <th className={`${DASH_TH} text-left py-2.5 px-2`}>
                    {t("dashboard.skuCol")}
                  </th>
                  <th className={`${DASH_TH} py-2.5 pr-3 text-right`}>
                    {t("dashboard.qtyCol")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-0">
                      <EmptyState compact title={t("dashboard.noData")} className="border-0 bg-transparent shadow-none" />
                    </td>
                  </tr>
                ) : (
                  data.topProducts.map((p) => (
                    <tr key={p.productId ?? p.sku} className="border-t border-[#EBEDF0]">
                      <td className="py-2.5 pl-3 pr-2 text-[#34495E]">{p.name}</td>
                      <td className="px-2 py-2.5 text-[#34495E]">{p.sku}</td>
                      <td className="py-2.5 pr-3 text-right text-[#34495E]">{p.quantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      <p className="mt-6 text-sm font-medium">
        <Link href="/reporting" className="text-primary hover:underline">
          {t("dashboard.osvLink")}
        </Link>
      </p>
    </section>
  );
}
