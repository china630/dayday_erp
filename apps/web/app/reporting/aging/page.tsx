"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { TrendingDown } from "lucide-react";
import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/empty-state";
import {
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
} from "../../../lib/design-system";

type Row = {
  counterpartyId: string;
  name: string;
  taxId: string;
  bucket0to30: string;
  bucket31to60: string;
  bucket61plus: string;
  total: string;
};

type Payload = {
  asOf: string;
  rows: Row[];
  totals: {
    bucket0to30: string;
    bucket31to60: string;
    bucket61plus: string;
    total: string;
  };
  methodologyNote?: string;
};

export default function AgingPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await apiFetch("/api/reporting/aging");
    setLoading(false);
    if (!res.ok) {
      setErr(`${t("aging.loadErr")}: ${res.status}`);
      setData(null);
    } else {
      setData((await res.json()) as Payload);
    }
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <PageHeader title={t("aging.title")} subtitle={t("aging.subtitle")} />

      {data && (
        <p className="text-sm text-slate-600">
          {t("aging.asOf")}: <span className="font-medium text-gray-900">{data.asOf}</span>
        </p>
      )}
      {err && <p className="text-red-600 text-sm">{err}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && data && data.rows.length === 0 && !err && (
        <EmptyState
          icon={<TrendingDown className="h-12 w-12 mx-auto stroke-[1.5]" aria-hidden />}
          title={t("aging.none")}
          description={t("aging.emptyHint")}
        />
      )}
      {!loading && data && data.rows.length > 0 && (
        <>
          <div className={DATA_TABLE_VIEWPORT_CLASS}>
            <table className={`${DATA_TABLE_CLASS} min-w-full`}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("aging.thName")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("aging.thTaxId")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("aging.th030")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("aging.th3160")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("aging.th61")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("aging.thTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.counterpartyId} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_CLASS} font-semibold text-[#34495E]`}>{r.name}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{r.taxId}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(r.bucket0to30)}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(r.bucket31to60)}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(r.bucket61plus)}</td>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} font-semibold`}>
                      {formatMoneyAzn(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`${DATA_TABLE_TR_CLASS} border-t-2 border-[#D5DADF] bg-[#F8FAFC] font-semibold`}>
                  <td className={DATA_TABLE_TD_CLASS} colSpan={2}>
                    {t("aging.totals")}
                  </td>
                  <td className={DATA_TABLE_TD_RIGHT_CLASS}>
                    {formatMoneyAzn(data.totals.bucket0to30)}
                  </td>
                  <td className={DATA_TABLE_TD_RIGHT_CLASS}>
                    {formatMoneyAzn(data.totals.bucket31to60)}
                  </td>
                  <td className={DATA_TABLE_TD_RIGHT_CLASS}>
                    {formatMoneyAzn(data.totals.bucket61plus)}
                  </td>
                  <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(data.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {data.methodologyNote && (
            <p className="text-xs text-slate-500 max-w-3xl">{data.methodologyNote}</p>
          )}
        </>
      )}
    </div>
  );
}
