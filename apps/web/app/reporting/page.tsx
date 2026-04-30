"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api-client";
import {
  canCloseAccountingPeriod,
  canUsePlDepartmentFilter,
} from "../../lib/role-utils";
import { ledgerQueryParam, useLedger } from "../../lib/ledger-context";
import { formatMoneyAzn } from "../../lib/format-money";
import { CHART_ACCOUNT_NAMES_AZ } from "../../lib/i18n/chart-account-names-az";
import { useRequireAuth } from "../../lib/use-require-auth";
import { PageHeader } from "../../components/layout/page-header";
import { EmptyState } from "../../components/empty-state";
import {
  BORDER_MUTED_CLASS,
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../lib/design-system";

const REPORT_TH =
  "px-3 py-2 text-left text-[13px] font-semibold text-[#34495E]";
const REPORT_TH_NUM =
  "px-3 py-2 text-right text-[13px] font-semibold text-[#34495E] tabular-nums";

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(last)}`,
  };
}

type TbRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
};

type TbPayload = {
  dateFrom: string;
  dateTo: string;
  ledgerType?: string;
  rows: TbRow[];
};

type PlLine = { accountCode?: string; label: string; amount: string };

type PlPayload = {
  dateFrom: string;
  dateTo: string;
  ledgerType?: string;
  lines: PlLine[];
  netProfit: string;
  methodologyNote?: string;
  departmentId?: string | null;
  payrollExpenseSource?: string;
};

function trialBalanceAccountName(code: string, apiName: string, lang: string): string {
  if (lang.startsWith("az")) {
    const az = CHART_ACCOUNT_NAMES_AZ[code];
    if (az) return az;
  }
  return apiName;
}

function plLineDisplayLabel(
  line: PlLine,
  lang: string,
  t: (key: string, o?: { defaultValue?: string }) => string,
): string {
  const code = line.accountCode;
  if (!code) return line.label;
  if (lang.startsWith("az")) {
    const az = CHART_ACCOUNT_NAMES_AZ[code];
    if (az) return az;
  }
  return t(`reporting.plLine.${code}`, { defaultValue: line.label });
}

export default function ReportingPage() {
  const { t, i18n } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const b = monthBounds();
  const [from, setFrom] = useState(b.from);
  const [to, setTo] = useState(b.to);
  const [tb, setTb] = useState<TbPayload | null>(null);
  const [pl, setPl] = useState<PlPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<"tb" | "pl" | null>(null);
  const [activeReport, setActiveReport] = useState<"tb" | "pl" | null>(null);
  const [closeYear, setCloseYear] = useState(new Date().getUTCFullYear());
  const [closeMonth, setCloseMonth] = useState(new Date().getUTCMonth() + 1);
  const [closing, setClosing] = useState(false);
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const canClose = canCloseAccountingPeriod(user?.role ?? undefined);
  const canFilterPlByDepartment = canUsePlDepartmentFilter(user?.role ?? undefined);
  const [plDepartments, setPlDepartments] = useState<{ id: string; name: string }[]>([]);
  const [plDepartmentId, setPlDepartmentId] = useState("");
  const [exportBusy, setExportBusy] = useState<null | "tb-pdf" | "tb-xlsx" | "pl-pdf" | "pl-xlsx">(null);

  const loadTb = useCallback(async () => {
    if (!token) return;
    setLoading("tb");
    setErr(null);
    const path = `/api/reporting/trial-balance?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}&${ledgerQueryParam(ledgerType)}`;
    const res = await apiFetch(path);
    setLoading(null);
    if (!res.ok) {
      setErr(`${t("reporting.tbErr")}: ${res.status}`);
      setTb(null);
      return;
    }
    setTb((await res.json()) as TbPayload);
    setActiveReport("tb");
  }, [from, to, token, t, ledgerType]);

  async function closePeriod() {
    if (!token || !canClose) return;
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
      if (j.depreciation.assetsCount > 0 && Number(j.depreciation.totalAmount) > 0) {
        msg += ` ${t("dashboard.closeDepr", {
          amount: j.depreciation.totalAmount,
          count: String(j.depreciation.assetsCount),
        })}`;
      } else {
        msg += ` ${t("dashboard.closeDeprNone")}`;
      }
    }
    setCloseMsg(msg);
  }

  const loadPl = useCallback(async () => {
    if (!token) return;
    setLoading("pl");
    setErr(null);
    let path = `/api/reporting/pl?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}&${ledgerQueryParam(ledgerType)}`;
    if (canFilterPlByDepartment && plDepartmentId.trim()) {
      path += `&departmentId=${encodeURIComponent(plDepartmentId.trim())}`;
    }
    const res = await apiFetch(path);
    setLoading(null);
    if (!res.ok) {
      setErr(`${t("reporting.plErr")}: ${res.status}`);
      setPl(null);
      return;
    }
    setPl((await res.json()) as PlPayload);
    setActiveReport("pl");
  }, [from, to, token, t, ledgerType, plDepartmentId, canFilterPlByDepartment]);

  async function exportReport(kind: "tb" | "pl", format: "pdf" | "xlsx") {
    if (!token) return;
    const key = `${kind}-${format}` as typeof exportBusy;
    setExportBusy(key);
    try {
      const qs = new URLSearchParams({
        dateFrom: from,
        dateTo: to,
        ledgerType,
        format,
      });
      if (kind === "pl" && canFilterPlByDepartment && plDepartmentId.trim()) {
        qs.set("departmentId", plDepartmentId.trim());
      }
      const path =
        kind === "tb"
          ? `/api/reporting/trial-balance/export?${qs.toString()}`
          : `/api/reporting/pl/export?${qs.toString()}`;
      const res = await apiFetch(path);
      if (!res.ok) {
        setErr(`${t("reporting.exportErr", { defaultValue: "Export failed" })}: ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${from}-${to}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExportBusy(null);
    }
  }

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await apiFetch("/api/hr/departments");
      if (!res.ok) return;
      setPlDepartments(await res.json());
    })();
  }, [token]);

  useEffect(() => {
    if (!ready || !ledgerReady || !token) return;
    if (activeReport === "tb") void loadTb();
    else if (activeReport === "pl") void loadPl();
  }, [ledgerType, ready, ledgerReady, token, activeReport, loadTb, loadPl]);

  if (!ready || !ledgerReady) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  const segBtn = (isActive: boolean, disabled: boolean) =>
    [
      "inline-flex h-8 min-h-8 items-center justify-center rounded-[2px] px-4 text-[13px] font-semibold transition-colors",
      isActive
        ? "bg-[#2980B9] text-white shadow-sm hover:bg-[#2471A3]"
        : "border border-[#D5DADF] bg-white text-[#34495E] hover:bg-[#F4F5F7]",
      disabled ? "opacity-60 cursor-wait" : "",
    ].join(" ");

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("reporting.title")}
        subtitle={
          <Fragment>
            <p className="m-0">{t("reporting.activeLedger", { ledger: ledgerType })}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link href="/reporting/receivables" className="text-action hover:text-primary">
                {t("reporting.receivablesLink")}
              </Link>
              <Link href="/reporting/reconciliation" className="text-action hover:text-primary">
                {t("reporting.reconciliationLink")}
              </Link>
              <Link href="/reporting/aging" className="text-action hover:text-primary">
                {t("reporting.agingLink")}
              </Link>
              <Link href="/reporting/tax-export" className="text-action hover:text-primary">
                {t("reporting.taxExportLink")}
              </Link>
            </div>
          </Fragment>
        }
        actions={
          canClose ? (
            <div className={`flex flex-wrap items-end gap-3 px-4 py-3 ${CARD_CONTAINER_CLASS}`}>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">{t("dashboard.year")}</span>
                <input
                  type="number"
                  value={closeYear}
                  onChange={(e) => setCloseYear(Number(e.target.value))}
                  className="w-28 rounded-md border border-slate-200 px-2 py-1.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-600">{t("dashboard.month")}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={closeMonth}
                  onChange={(e) => setCloseMonth(Number(e.target.value))}
                  className="w-24 rounded-md border border-slate-200 px-2 py-1.5"
                />
              </label>
              <button
                type="button"
                onClick={() => void closePeriod()}
                disabled={closing}
                className={PRIMARY_BUTTON_CLASS}
              >
                {closing ? t("dashboard.closing") : t("reporting.closePeriodBtn")}
              </button>
            </div>
          ) : undefined
        }
      />
      {closeMsg && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">{closeMsg}</p>}

      <div
        className={`flex flex-col flex-wrap gap-4 lg:flex-row lg:items-end ${CARD_CONTAINER_CLASS} p-4`}
      >
        <div className="flex flex-wrap items-end gap-3" role="group" aria-label="period">
          <label className="flex flex-col gap-1 text-sm font-medium text-[#34495E]">
            <span>{t("reporting.from")}</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`rounded-[2px] border bg-white px-2 py-1.5 text-sm text-[#34495E] ${BORDER_MUTED_CLASS}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#34495E]">
            <span>{t("reporting.to")}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`rounded-[2px] border bg-white px-2 py-1.5 text-sm text-[#34495E] ${BORDER_MUTED_CLASS}`}
            />
          </label>
          {canFilterPlByDepartment && (
            <label className="flex flex-col gap-1 text-sm font-medium text-[#34495E]">
              <span>{t("reporting.plDepartment")}</span>
              <select
                value={plDepartmentId}
                onChange={(e) => setPlDepartmentId(e.target.value)}
                className={`rounded-[2px] border bg-white px-2 py-1.5 text-sm font-normal min-w-[180px] text-[#34495E] ${BORDER_MUTED_CLASS}`}
              >
                <option value="">{t("reporting.plDepartmentAll")}</option>
                {plDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div
          className="inline-flex p-1 rounded-[2px] border border-[#D5DADF] bg-white gap-1"
          role="group"
          aria-label="report type"
        >
          <button
            type="button"
            className={segBtn(activeReport === "tb", loading === "tb")}
            disabled={loading === "tb"}
            onClick={() => void loadTb()}
          >
            {loading === "tb" ? "…" : t("reporting.loadTb")}
          </button>
          <button
            type="button"
            className={segBtn(activeReport === "pl", loading === "pl")}
            disabled={loading === "pl"}
            onClick={() => void loadPl()}
          >
            {loading === "pl" ? "…" : t("reporting.loadPl")}
          </button>
        </div>
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      {tb && activeReport === "tb" && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[#34495E]">{t("reporting.tbTitle")}</h2>
          <p className="text-sm text-slate-500">
            {tb.dateFrom} — {tb.dateTo}
          </p>
          <div className="flex gap-2">
            <button className={PRIMARY_BUTTON_CLASS} disabled={Boolean(exportBusy)} onClick={() => void exportReport("tb", "pdf")}>
              {exportBusy === "tb-pdf" ? "…" : t("reporting.exportPdf", { defaultValue: "Экспорт PDF" })}
            </button>
            <button className={PRIMARY_BUTTON_CLASS} disabled={Boolean(exportBusy)} onClick={() => void exportReport("tb", "xlsx")}>
              {exportBusy === "tb-xlsx" ? "…" : t("reporting.exportXlsx", { defaultValue: "Экспорт XLSX" })}
            </button>
          </div>
          {tb.rows.length === 0 ? (
            <EmptyState title={t("reporting.tbTitle")} description={t("reporting.emptyTb")} />
          ) : (
            <>
          <div className="md:hidden space-y-2">
            {tb.rows.map((r) => (
              <div
                key={r.accountId}
                className="rounded-xl border border-slate-100 bg-white p-3 text-xs shadow-sm space-y-1"
              >
                <div className="font-mono font-medium">{r.accountCode}</div>
                <div className="text-slate-700">
                  {trialBalanceAccountName(r.accountCode, r.accountName, i18n.language)}
                </div>
                <div className="text-slate-500">{r.accountType}</div>
                <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-50">
                  <span>{t("reporting.thPerDr")}</span>
                  <span className="text-right">{formatMoneyAzn(r.periodDebit)}</span>
                  <span>{t("reporting.thPerCr")}</span>
                  <span className="text-right">{formatMoneyAzn(r.periodCredit)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={`hidden md:block overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-[#D5DADF]">
                  <th className={REPORT_TH}>{t("reporting.thCode")}</th>
                  <th className={REPORT_TH}>{t("reporting.thAccName")}</th>
                  <th className={`hidden lg:table-cell ${REPORT_TH}`}>
                    {t("reporting.thType")}
                  </th>
                  <th className={`hidden xl:table-cell ${REPORT_TH_NUM}`}>
                    {t("reporting.thOpenDr")}
                  </th>
                  <th className={`hidden xl:table-cell ${REPORT_TH_NUM}`}>
                    {t("reporting.thOpenCr")}
                  </th>
                  <th className={REPORT_TH_NUM}>{t("reporting.thPerDr")}</th>
                  <th className={REPORT_TH_NUM}>{t("reporting.thPerCr")}</th>
                  <th className={`hidden xl:table-cell ${REPORT_TH_NUM}`}>
                    {t("reporting.thCloseDr")}
                  </th>
                  <th className={`hidden xl:table-cell ${REPORT_TH_NUM}`}>
                    {t("reporting.thCloseCr")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((r) => (
                  <tr key={r.accountId} className="border-b border-[#EBEDF0]">
                    <td className="px-3 py-2 font-mono text-[13px] text-[#34495E]">{r.accountCode}</td>
                    <td
                      className="max-w-[200px] truncate px-3 py-2 text-[13px] text-[#34495E]"
                      title={r.accountName}
                    >
                      {trialBalanceAccountName(r.accountCode, r.accountName, i18n.language)}
                    </td>
                    <td className="hidden px-3 py-2 text-[13px] text-[#34495E] lg:table-cell">
                      {r.accountType}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-[#34495E] xl:table-cell">
                      {formatMoneyAzn(r.openingDebit)}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-[#34495E] xl:table-cell">
                      {formatMoneyAzn(r.openingCredit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#34495E]">
                      {formatMoneyAzn(r.periodDebit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#34495E]">
                      {formatMoneyAzn(r.periodCredit)}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-[#34495E] xl:table-cell">
                      {formatMoneyAzn(r.closingDebit)}
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums text-[#34495E] xl:table-cell">
                      {formatMoneyAzn(r.closingCredit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </>
          )}
        </section>
      )}

      {pl && activeReport === "pl" && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[#34495E]">{t("reporting.plTitle")}</h2>
          <p className="text-[13px] text-[#7F8C8D]">
            {pl.dateFrom} — {pl.dateTo}
          </p>
          <div className="flex gap-2">
            <button className={PRIMARY_BUTTON_CLASS} disabled={Boolean(exportBusy)} onClick={() => void exportReport("pl", "pdf")}>
              {exportBusy === "pl-pdf" ? "…" : t("reporting.exportPdf", { defaultValue: "Экспорт PDF" })}
            </button>
            <button className={PRIMARY_BUTTON_CLASS} disabled={Boolean(exportBusy)} onClick={() => void exportReport("pl", "xlsx")}>
              {exportBusy === "pl-xlsx" ? "…" : t("reporting.exportXlsx", { defaultValue: "Экспорт XLSX" })}
            </button>
          </div>
          <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D5DADF]">
                  <th className={REPORT_TH}>{t("reporting.thPlLine")}</th>
                  <th className={REPORT_TH_NUM}>{t("reporting.thPlAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {pl.lines.map((line, i) => {
                  const code = line.accountCode;
                  const label = plLineDisplayLabel(line, i18n.language, t);
                  return (
                    <tr key={`${code ?? line.label}-${i}`} className="border-b border-[#EBEDF0]">
                      <td className="px-3 py-2 text-[13px] text-[#34495E]">{label}</td>
                      <td className="px-3 py-2 text-right text-[13px] tabular-nums text-[#34495E]">
                        {formatMoneyAzn(line.amount)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-[#D5DADF] bg-[#EBEDF0] font-bold text-[#34495E]">
                  <td className="px-3 py-2">{t("reporting.netProfit")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyAzn(pl.netProfit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 max-w-3xl">
            {pl.methodologyNote ?? t("reporting.plMethodology")}
          </p>
        </section>
      )}
    </div>
  );
}
