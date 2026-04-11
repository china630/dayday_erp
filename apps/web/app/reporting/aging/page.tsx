"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { TrendingDown } from "lucide-react";
import { ModulePageLinks } from "../../../components/module-page-links";
import { EmptyState } from "../../../components/empty-state";

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
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/reporting", labelKey: "nav.reportingHub" },
          { href: "/reporting/receivables", labelKey: "nav.receivables" },
          { href: "/invoices", labelKey: "nav.invoices" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t("aging.title")}</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">{t("aging.subtitle")}</p>
      </div>

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
          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="text-sm min-w-full">
              <thead>
                <tr>
                  <th className="text-left p-2">{t("aging.thName")}</th>
                  <th className="text-left p-2">{t("aging.thTaxId")}</th>
                  <th className="text-right p-2">{t("aging.th030")}</th>
                  <th className="text-right p-2">{t("aging.th3160")}</th>
                  <th className="text-right p-2">{t("aging.th61")}</th>
                  <th className="text-right p-2">{t("aging.thTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.counterpartyId} className="border-t border-slate-100">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.taxId}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(r.bucket0to30)}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(r.bucket31to60)}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(r.bucket61plus)}</td>
                    <td className="p-2 text-right font-mono font-medium">{formatMoneyAzn(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <td className="p-2" colSpan={2}>
                    {t("aging.totals")}
                  </td>
                  <td className="p-2 text-right font-mono">{formatMoneyAzn(data.totals.bucket0to30)}</td>
                  <td className="p-2 text-right font-mono">{formatMoneyAzn(data.totals.bucket31to60)}</td>
                  <td className="p-2 text-right font-mono">{formatMoneyAzn(data.totals.bucket61plus)}</td>
                  <td className="p-2 text-right font-mono">{formatMoneyAzn(data.totals.total)}</td>
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
