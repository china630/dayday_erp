"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../../lib/api-client";
import { safeJson } from "../../../../../lib/api-fetch";
import { inputFieldClass } from "../../../../../lib/form-classes";
import { useRequireAuth } from "../../../../../lib/use-require-auth";
import { PageHeader } from "../../../../../components/layout/page-header";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

type ReconJournalLine = {
  journalEntryId: string | null;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
};

type ReconTransaction = {
  id: string;
  date: string;
  transactionId: string | null;
  kind: string;
  reference: string;
  description: string;
  currency: string | null;
  journalLines: ReconJournalLine[];
  runningBalance: string;
};

type ReconPayload = {
  openingBalance: string;
  closingBalance: string;
  openingBalanceDetail?: { currency: string; side: string; signedAmount: string };
  dateFrom: string;
  dateTo: string;
  transactions: ReconTransaction[];
  methodologyNote?: string;
};

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  return { start, end };
}

export default function CounterpartyReconciliationPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [email, setEmail] = useState("");
  const [{ start: periodStart, end: periodEnd }, setPeriod] = useState(defaultPeriod);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [reconBusy, setReconBusy] = useState(false);
  const [reconErr, setReconErr] = useState<string | null>(null);
  const [recon, setRecon] = useState<ReconPayload | null>(null);

  const loadMeta = useCallback(async () => {
    if (!token || !id) return;
    const res = await apiFetch(`/api/counterparties/${id}`);
    if (!res.ok) return;
    const r = (await res.json()) as { email?: string | null };
    setEmail(r.email ?? "");
  }, [id, token]);

  useEffect(() => {
    if (!ready || !token || !id) return;
    void loadMeta();
  }, [loadMeta, ready, token, id]);

  const flatReconRows = useMemo(() => {
    if (!recon?.transactions) return [];
    const rows: Array<
      ReconJournalLine & { date: string; reference: string; kind: string; runningBalance: string }
    > = [];
    for (const tx of recon.transactions) {
      for (const jl of tx.journalLines) {
        rows.push({
          ...jl,
          date: tx.date,
          reference: tx.reference,
          kind: tx.kind,
          runningBalance: tx.runningBalance,
        });
      }
    }
    return rows;
  }, [recon]);

  async function loadReconciliation() {
    if (!token || !id) return;
    setReconBusy(true);
    setReconErr(null);
    const q = new URLSearchParams({
      startDate: periodStart,
      endDate: periodEnd,
    });
    if (currencyFilter.trim()) q.set("currency", currencyFilter.trim().toUpperCase());
    const res = await apiFetch(`/api/reports/reconciliation/${id}?${q.toString()}`);
    setReconBusy(false);
    if (!res.ok) {
      setReconErr(`${t("counterparties.reconLoadErr")}: ${res.status}`);
      setRecon(null);
      return;
    }
    const j = await safeJson<ReconPayload>(res);
    setRecon(j);
  }

  async function downloadRecon(kind: "pdf" | "xlsx") {
    if (!token || !id) return;
    const q = new URLSearchParams({ startDate: periodStart, endDate: periodEnd });
    if (currencyFilter.trim()) q.set("currency", currencyFilter.trim().toUpperCase());
    const path =
      kind === "pdf"
        ? `/api/reports/reconciliation/${id}/pdf?${q}`
        : `/api/reports/reconciliation/${id}/xlsx?${q}`;
    const res = await apiFetch(path);
    if (!res.ok) {
      alert(`${t("counterparties.reconExportErr")}: ${res.status}`);
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition");
    const m = cd?.match(/filename="([^"]+)"/);
    const fallback =
      kind === "pdf"
        ? `reconciliation-${periodStart}-${periodEnd}.pdf`
        : `reconciliation-${periodStart}-${periodEnd}.xlsx`;
    const filename = m?.[1] ?? fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function emailReconciliation() {
    if (!token || !id) return;
    const q = new URLSearchParams({ startDate: periodStart, endDate: periodEnd });
    if (currencyFilter.trim()) q.set("currency", currencyFilter.trim().toUpperCase());
    setReconBusy(true);
    setReconErr(null);
    const res = await apiFetch(`/api/reports/reconciliation/${id}/email?${q.toString()}`, {
      method: "POST",
    });
    setReconBusy(false);
    if (!res.ok) {
      const text = await res.text();
      setReconErr(`${t("counterparties.reconEmailErr")}: ${res.status} ${text}`);
      return;
    }
    alert(t("counterparties.reconEmailOk"));
  }

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
      <PageHeader
        title={t("counterparties.tabReconciliation")}
        actions={
          <Link
            href="/crm/counterparties"
            className="inline-flex h-8 items-center rounded-[2px] border border-[#D5DADF] bg-white px-4 text-[13px] font-medium text-[#34495E] shadow-sm hover:bg-[#F4F5F7]"
          >
            {t("counterparties.backList")}
          </Link>
        }
      />

      <p className="text-sm text-slate-600">{t("counterparties.reconSubtitle")}</p>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
        <div>
          <span className={lbl}>{t("counterparties.reconStart")}</span>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
            className={inputFieldClass}
          />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.reconEnd")}</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
            className={inputFieldClass}
          />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.reconCurrency")}</span>
          <input
            placeholder="AZN"
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value.toUpperCase())}
            className={`${inputFieldClass} w-28 uppercase`}
          />
        </div>
        <button
          type="button"
          disabled={reconBusy}
          onClick={() => void loadReconciliation()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {reconBusy ? "…" : t("counterparties.reconLoad")}
        </button>
      </div>
      {reconErr && <p className="text-sm text-red-600">{reconErr}</p>}
      {recon && (
        <>
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-slate-500">{t("counterparties.reconOpening")}: </span>
              <span className="font-semibold tabular-nums">{recon.openingBalance}</span>
              {recon.openingBalanceDetail?.currency && (
                <span className="ml-1 text-slate-500">{recon.openingBalanceDetail.currency}</span>
              )}
            </div>
            <div>
              <span className="text-slate-500">{t("counterparties.reconClosing")}: </span>
              <span className="font-semibold tabular-nums">{recon.closingBalance}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reconBusy}
              onClick={() => void downloadRecon("pdf")}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {t("counterparties.reconPdf")}
            </button>
            <button
              type="button"
              disabled={reconBusy}
              onClick={() => void downloadRecon("xlsx")}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {t("counterparties.reconXlsx")}
            </button>
            <button
              type="button"
              disabled={reconBusy || !email?.trim()}
              onClick={() => void emailReconciliation()}
              className="rounded-lg border border-action/30 px-3 py-2 text-sm font-medium text-primary hover:bg-action/10 disabled:opacity-40"
            >
              {t("counterparties.reconEmail")}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t("counterparties.reconThDate")}</th>
                  <th className="px-3 py-2">{t("counterparties.reconThRef")}</th>
                  <th className="px-3 py-2">{t("counterparties.reconThKind")}</th>
                  <th className="px-3 py-2">{t("counterparties.reconThAccount")}</th>
                  <th className="px-3 py-2 text-right">{t("counterparties.reconThDr")}</th>
                  <th className="px-3 py-2 text-right">{t("counterparties.reconThCr")}</th>
                  <th className="px-3 py-2 text-right">{t("counterparties.reconThBal")}</th>
                </tr>
              </thead>
              <tbody>
                {flatReconRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      {t("counterparties.reconEmpty")}
                    </td>
                  </tr>
                ) : (
                  flatReconRows.map((row, idx) => (
                    <tr key={`${row.journalEntryId ?? "s"}-${idx}`} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2">{row.date}</td>
                      <td className="px-3 py-2">{row.reference}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{row.kind}</td>
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs">{row.accountCode}</div>
                        <div className="text-xs text-slate-600">{row.accountName}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.debit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.credit}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{row.runningBalance}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {recon.methodologyNote && (
            <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">{recon.methodologyNote}</p>
          )}
        </>
      )}
    </div>
  );
}
