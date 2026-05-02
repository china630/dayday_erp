"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { ledgerQueryParam, useLedger } from "../../../lib/ledger-context";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ArrowUpRight } from "lucide-react";
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
  balance: string;
};

type Payload = {
  ledgerType?: string;
  accountCode: string;
  rows: Row[];
  totalBalance: string;
};

export default function ReceivablesPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch(
      `/api/reporting/receivables?${ledgerQueryParam(ledgerType)}`,
    );
    if (!res.ok) {
      setError(`${t("receivables.loadErr")}: ${res.status}`);
      setData(null);
    } else {
      setData((await res.json()) as Payload);
    }
    setLoading(false);
  }, [token, t, ledgerType]);

  useEffect(() => {
    if (!ready || !ledgerReady || !token) return;
    void load();
  }, [load, ready, ledgerReady, token, ledgerType]);

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
      <PageHeader title={t("receivables.title")} subtitle={t("receivables.subtitle")} />

      {data && (
        <p className="text-[13px] text-[#7F8C8D]">
          {t("receivables.account")}:{" "}
          <span className="font-semibold text-[#34495E]">{data.accountCode}</span>
        </p>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && data && data.rows.length === 0 && !error && (
        <EmptyState
          icon={<ArrowUpRight className="h-12 w-12 mx-auto stroke-[1.5]" aria-hidden />}
          title={t("receivables.none")}
          description={t("receivables.emptyHint")}
        />
      )}
      {!loading && data && data.rows.length > 0 && (
        <>
          <div className={DATA_TABLE_VIEWPORT_CLASS}>
            <table className={`${DATA_TABLE_CLASS} w-full min-w-[480px]`}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("receivables.thName")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("receivables.thTaxId")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("receivables.thBalance")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.counterpartyId} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_CLASS} font-semibold text-[#34495E]`}>{r.name}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{r.taxId}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-base font-semibold text-[#34495E]">
            {t("receivables.total")}: {formatMoneyAzn(data.totalBalance)}
          </p>
        </>
      )}
    </div>
  );
}
