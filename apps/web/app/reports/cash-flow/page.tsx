"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../../lib/form-styles";
import { formatMoneyAzn } from "../../../lib/format-money";

type SectionKey = "OPERATING" | "INVESTING" | "FINANCING";

type CashFlowRow = {
  cashFlowItemId: string;
  code: string;
  name: string;
  inflow: string;
  outflow: string;
  net: string;
};

type CashFlowPayload = {
  dateFrom: string;
  dateTo: string;
  methodologyNote?: string;
  source: { cashDeskId: string | null; bankName: string | null };
  sections: Array<{
    section: SectionKey;
    inflow: string;
    outflow: string;
    net: string;
    rows: CashFlowRow[];
  }>;
  total: { inflow: string; outflow: string; net: string };
  cached?: boolean;
  sourceCount: number;
};

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

function fmt(v: unknown): string {
  return formatMoneyAzn(v).replace("₼", "").trim();
}

export default function CashFlowPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const b = useMemo(() => monthBounds(), []);

  const [from, setFrom] = useState(b.from);
  const [to, setTo] = useState(b.to);
  const [cashDeskId, setCashDeskId] = useState("");
  const [bankName, setBankName] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<CashFlowPayload | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    setData(null);
    const qs = new URLSearchParams({
      dateFrom: from,
      dateTo: to,
      ...(cashDeskId.trim() ? { cashDeskId: cashDeskId.trim() } : {}),
      ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
    });
    const res = await apiFetch(`/api/reports/cash-flow?${qs.toString()}`);
    setLoading(false);
    if (!res.ok) {
      setErr(`${t("reports.cashFlow.err")}: ${res.status}`);
      return;
    }
    setData((await res.json()) as CashFlowPayload);
  }, [token, from, to, cashDeskId, bankName, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [ready, token, load]);

  if (!ready) return <div className="text-gray-600">{t("common.loading")}</div>;
  if (!token) return null;

  const secTitle = (s: SectionKey) =>
    s === "OPERATING"
      ? t("reports.cashFlow.sectionOperating")
      : s === "INVESTING"
        ? t("reports.cashFlow.sectionInvesting")
        : t("reports.cashFlow.sectionFinancing");

  return (
    <div className="space-y-6">
      <ModulePageLinks items={[{ href: "/", labelKey: "nav.home" }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#34495E]">
            {t("reports.cashFlow.title")}
          </h1>
          <p className="mt-1 text-[13px] text-[#7F8C8D]">
            {t("reports.cashFlow.hint")}
          </p>
        </div>
        <div className={`${CARD_CONTAINER_CLASS} p-4 flex flex-wrap items-end gap-3`}>
          <label className="flex flex-col gap-1">
            <span className={FORM_LABEL_CLASS}>{t("reports.cashFlow.dateFrom")}</span>
            <input
              type="date"
              className={FORM_INPUT_CLASS}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={FORM_LABEL_CLASS}>{t("reports.cashFlow.dateTo")}</span>
            <input
              type="date"
              className={FORM_INPUT_CLASS}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[220px]">
            <span className={FORM_LABEL_CLASS}>{t("reports.cashFlow.cashDeskId")}</span>
            <input
              className={FORM_INPUT_CLASS}
              value={cashDeskId}
              onChange={(e) => setCashDeskId(e.target.value)}
              placeholder={t("reports.cashFlow.cashDeskIdPh")}
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[220px]">
            <span className={FORM_LABEL_CLASS}>{t("reports.cashFlow.bankName")}</span>
            <input
              className={FORM_INPUT_CLASS}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t("reports.cashFlow.bankNamePh")}
            />
          </label>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? "…" : t("reports.cashFlow.load")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            disabled={loading}
            onClick={() => {
              const b = monthBounds();
              setFrom(b.from);
              setTo(b.to);
              setCashDeskId("");
              setBankName("");
            }}
          >
            {t("common.reset")}
          </button>
        </div>
      </div>

      {err ? <div className="text-sm text-red-600">{err}</div> : null}

      {data?.methodologyNote ? (
        <p className="text-[12px] text-[#7F8C8D] max-w-4xl leading-snug">
          {data.methodologyNote}
        </p>
      ) : null}

      {!data ? null : (
        <div className="space-y-4">
          {data.sections.map((s) => (
            <div key={s.section} className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
              <div className="flex items-center justify-between gap-3 border-b border-[#D5DADF] bg-[#F8F9FA] px-4 py-3">
                <div className="text-[13px] font-semibold text-[#34495E]">
                  {secTitle(s.section)}
                </div>
                <div className="text-xs text-[#7F8C8D] tabular-nums">
                  {t("reports.cashFlow.total")}: {fmt(s.inflow)} / {fmt(s.outflow)} ·{" "}
                  {fmt(s.net)}
                  {data.cached ? ` · ${t("reports.cached")}` : ""}
                </div>
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#EBEDF0] bg-white">
                    <th className="p-2 text-left text-[13px] font-semibold text-[#34495E]">
                      {t("reports.cashFlow.thItem")}
                    </th>
                    <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] tabular-nums">
                      {t("reports.cashFlow.thIn")} (₼)
                    </th>
                    <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] tabular-nums">
                      {t("reports.cashFlow.thOut")} (₼)
                    </th>
                    <th className="p-2 text-right text-[13px] font-semibold text-[#34495E] tabular-nums">
                      {t("reports.cashFlow.thNet")} (₼)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.length === 0 ? (
                    <tr>
                      <td className="p-3 text-sm text-[#7F8C8D]" colSpan={4}>
                        —
                      </td>
                    </tr>
                  ) : (
                    s.rows.map((r) => (
                      <tr key={r.cashFlowItemId} className="border-t border-[#EBEDF0]">
                        <td className="p-2">
                          <div className="font-medium text-[#34495E]">
                            {r.code} — {r.name}
                          </div>
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {fmt(r.inflow)}
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">
                          {fmt(r.outflow)}
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums font-semibold text-[#34495E]">
                          {fmt(r.net)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ))}

          <div className={`${CARD_CONTAINER_CLASS} p-4 flex items-center justify-between`}>
            <div className="text-sm font-semibold text-[#34495E]">
              {t("reports.cashFlow.grandTotal")}
            </div>
            <div className="text-sm tabular-nums font-mono text-[#34495E]">
              {fmt(data.total.inflow)} / {fmt(data.total.outflow)} · {fmt(data.total.net)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

