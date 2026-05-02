"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { ledgerQueryParam, useLedger } from "../../../lib/ledger-context";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import {
  CARD_CONTAINER_CLASS,
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { EmptyState } from "../../../components/empty-state";
import { Building2 } from "lucide-react";

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

type HoldingListItem = {
  id: string;
  name: string;
  organizations: { id: string; name: string; taxId: string; currency: string }[];
};

type OrgPnlRow = {
  organizationId: string;
  organizationName: string;
  taxId: string;
  currency: string;
  netProfit: string;
};

type ConsolidatedPayload = {
  holdingId: string;
  holdingName: string;
  holdingBaseCurrency?: string;
  dateFrom: string;
  dateTo: string;
  ledgerType?: string;
  organizations: OrgPnlRow[];
  consolidatedNetProfitByCurrency: Record<string, string>;
  consolidatedNetProfitInHoldingBase?: string | null;
  consolidationNote?: string | null;
  consolidationFxMode?: string;
  consolidationFxSlices?: number;
};

export default function HoldingConsolidatedReportingPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const b = monthBounds();
  const [from, setFrom] = useState(b.from);
  const [to, setTo] = useState(b.to);
  const [holdings, setHoldings] = useState<HoldingListItem[]>([]);
  const [holdingId, setHoldingId] = useState("");
  const [report, setReport] = useState<ConsolidatedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const loadHoldings = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    setError(null);
    const res = await apiFetch("/api/holdings");
    if (!res.ok) {
      setError(`HTTP ${res.status}`);
      setHoldings([]);
    } else {
      const data = (await res.json()) as HoldingListItem[];
      setHoldings(data);
    }
    setLoadingList(false);
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadHoldings();
  }, [ready, token, loadHoldings]);

  useEffect(() => {
    if (holdings.length > 0 && !holdingId) {
      setHoldingId(holdings[0].id);
    }
  }, [holdings, holdingId]);

  const ledgerParam = ledgerQueryParam(ledgerType);
  const loadReport = useCallback(async () => {
    if (!token || !holdingId) return;
    setLoadingReport(true);
    setError(null);
    const res = await apiFetch(
      `/api/holdings/${encodeURIComponent(holdingId)}/consolidated-pnl?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}&${ledgerParam}`,
    );
    if (!res.ok) {
      setError(`${t("holdingReport.loadErr", { defaultValue: "Load failed" })}: ${res.status}`);
      setReport(null);
    } else {
      setReport((await res.json()) as ConsolidatedPayload);
    }
    setLoadingReport(false);
  }, [token, holdingId, from, to, ledgerParam, t]);

  if (!ready || !ledgerReady) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("holdingReport.title", {
          defaultValue: "Сводный отчёт по холдингу (P&L)",
        })}
        subtitle={t("holdingReport.subtitle", {
          defaultValue:
            "Чистая прибыль по каждой организации холдинга за период и итоги по валютам.",
        })}
      />

      <div className={`${CARD_CONTAINER_CLASS} space-y-4 p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-[#7F8C8D]">
              {t("holdingReport.holding", { defaultValue: "Холдинг" })}
            </span>
            <select
              className="rounded border border-[#E0E6ED] px-2 py-1.5 text-[13px] min-w-[200px]"
              value={holdingId}
              onChange={(e) => setHoldingId(e.target.value)}
              disabled={loadingList}
            >
              {holdings.length === 0 && (
                <option value="">{t("holdingReport.noHoldings", { defaultValue: "Нет холдингов" })}</option>
              )}
              {holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.organizations?.length ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-[#7F8C8D]">{t("reporting.from", { defaultValue: "С" })}</span>
            <input
              type="date"
              className="rounded border border-[#E0E6ED] px-2 py-1.5 text-[13px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-[#7F8C8D]">{t("reporting.to", { defaultValue: "По" })}</span>
            <input
              type="date"
              className="rounded border border-[#E0E6ED] px-2 py-1.5 text-[13px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            disabled={!holdingId || loadingReport}
            onClick={() => void loadReport()}
          >
            {loadingReport
              ? t("common.loading")
              : t("holdingReport.load", { defaultValue: "Показать" })}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loadingReport && report && report.organizations.length === 0 && (
        <EmptyState
          icon={<Building2 className="h-12 w-12 mx-auto stroke-[1.5]" aria-hidden />}
          title={t("holdingReport.noOrgs", { defaultValue: "Нет организаций в холдинге" })}
          description={t("holdingReport.noOrgsHint", {
            defaultValue: "Привяжите организации в разделе компаний или через API.",
          })}
        />
      )}

      {report && report.organizations.length > 0 && (
        <div className="space-y-0">
          <div className={DATA_TABLE_VIEWPORT_CLASS}>
            <table className={`${DATA_TABLE_CLASS} min-w-full`}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>
                    {t("holdingReport.colOrg", { defaultValue: "Организация" })}
                  </th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>VÖEN</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>
                    {t("holdingReport.colNetProfit", { defaultValue: "Чистая прибыль" })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.organizations.map((row) => (
                  <tr key={row.organizationId} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_CLASS} font-semibold text-[#34495E]`}>
                      {row.organizationName}
                    </td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{row.taxId}</td>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} font-semibold`}>
                      {row.netProfit} {row.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${CARD_CONTAINER_CLASS} rounded-t-none border-t-0 -mt-px space-y-1 px-3 py-3`}>
            <p className="m-0 text-[12px] font-semibold text-[#34495E]">
              {t("holdingReport.consolidated", { defaultValue: "Итого по валютам" })}
            </p>
            {Object.entries(report.consolidatedNetProfitByCurrency).map(([cur, amt]) => (
              <p key={cur} className="text-[13px] tabular-nums text-[#34495E]">
                {amt} {cur}
              </p>
            ))}
            {report.consolidatedNetProfitInHoldingBase != null &&
            report.holdingBaseCurrency ? (
              <p className="text-[13px] font-medium tabular-nums text-[#34495E] pt-1">
                Σ → {report.holdingBaseCurrency}: {report.consolidatedNetProfitInHoldingBase}
              </p>
            ) : null}
            {report.consolidationNote ? (
              <p className="text-[11px] text-[#7F8C8D] pt-1 leading-snug">
                {report.consolidationNote}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
