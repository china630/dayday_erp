"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { ledgerQueryParam, useLedger } from "../../../lib/ledger-context";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import { BORDER_MUTED_CLASS, PRIMARY_BUTTON_CLASS } from "../../../lib/design-system";

type Cp = { id: string; name: string; taxId: string };

type RecLine = {
  kind?: string;
  date: string;
  reference: string;
  description: string;
  debit: string;
  credit: string;
  balanceAfter: string;
};

type RecPayload = {
  organizationName?: string;
  organizationTaxId?: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: string;
  turnoverDebit: string;
  turnoverCredit: string;
  closingBalance: string;
  lines: RecLine[];
  methodologyNote?: string;
  methodologyNoteAz?: string;
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

type NettingPreview = {
  counterpartyId: string;
  counterpartyName: string;
  receivable: string;
  payable531: string;
  suggestedAmount: string;
  canNet: boolean;
};

export default function ReconciliationPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const b = monthBounds();
  const [from, setFrom] = useState(b.from);
  const [to, setTo] = useState(b.to);
  const [counterparties, setCounterparties] = useState<Cp[]>([]);
  const [cpId, setCpId] = useState("");
  const [data, setData] = useState<RecPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [nettingOpen, setNettingOpen] = useState(false);
  const [nettingPreview, setNettingPreview] = useState<NettingPreview | null>(null);
  const [nettingAmount, setNettingAmount] = useState("");
  const [nettingBusy, setNettingBusy] = useState(false);
  const [nettingErr, setNettingErr] = useState<string | null>(null);
  const [netCandidate, setNetCandidate] = useState<NettingPreview | null>(null);
  const [nettingLoad, setNettingLoad] = useState(false);

  const loadCps = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch("/api/counterparties");
    if (res.ok) {
      setCounterparties((await res.json()) as Cp[]);
    }
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadCps();
  }, [loadCps, ready, token]);

  useEffect(() => {
    if (!token || !cpId || !ledgerReady) {
      setNetCandidate(null);
      return;
    }
    let cancelled = false;
    setNettingLoad(true);
    const q = new URLSearchParams({ counterpartyId: cpId, ledgerType });
    void apiFetch(`/api/reporting/netting/preview?${q.toString()}`).then(
      async (res) => {
        if (cancelled) return;
        setNettingLoad(false);
        if (!res.ok) {
          setNetCandidate(null);
          return;
        }
        setNetCandidate((await res.json()) as NettingPreview);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, cpId, ledgerType, ledgerReady]);

  async function runReport() {
    if (!token || !cpId) {
      setErr(t("reconciliation.pickCp"));
      return;
    }
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({
      counterpartyId: cpId,
      dateFrom: from,
      dateTo: to,
    });
    const res = await apiFetch(`/api/reporting/reconciliation?${q.toString()}`);
    setLoading(false);
    if (!res.ok) {
      setErr(`${t("reconciliation.loadErr")}: ${res.status}`);
      setData(null);
      return;
    }
    setData((await res.json()) as RecPayload);
  }

  async function downloadPdf() {
    if (!token || !cpId) {
      setErr(t("reconciliation.pickCp"));
      return;
    }
    setPdfBusy(true);
    setErr(null);
    const q = new URLSearchParams({
      counterpartyId: cpId,
      dateFrom: from,
      dateTo: to,
    });
    try {
      const res = await apiFetch(`/api/reporting/reconciliation/pdf?${q.toString()}`);
      if (!res.ok) {
        setErr(`${t("reconciliation.loadErr")}: ${res.status}`);
        setPdfBusy(false);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let fname = "reconciliation.pdf";
      const m = cd?.match(/filename="([^"]+)"/);
      if (m) fname = m[1];
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setErr(String(e));
    }
    setPdfBusy(false);
  }

  async function openNettingModal() {
    if (!token || !cpId) {
      setErr(t("reconciliation.pickCp"));
      return;
    }
    setNettingErr(null);
    setNettingBusy(true);
    const q = new URLSearchParams({
      counterpartyId: cpId,
      ledgerType,
    });
    const res = await apiFetch(`/api/reporting/netting/preview?${q.toString()}`);
    setNettingBusy(false);
    if (!res.ok) {
      setNettingErr(`${t("reconciliation.loadErr")}: ${res.status}`);
      setNettingPreview(null);
      return;
    }
    const j = (await res.json()) as NettingPreview;
    if (!j.canNet) {
      setErr(t("reconciliation.nettingNoBothSides"));
      setNetCandidate(j);
      return;
    }
    setNettingPreview(j);
    setNettingAmount(j.suggestedAmount);
    setNettingOpen(true);
  }

  async function submitNetting() {
    if (!token || !cpId) return;
    const amt = Number(nettingAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setNettingErr(t("reconciliation.nettingAmountInvalid"));
      return;
    }
    setNettingBusy(true);
    setNettingErr(null);
    const suggested =
      nettingPreview != null ? Number(nettingPreview.suggestedAmount) : undefined;
    const res = await apiFetch(
      `/api/reporting/netting?${ledgerQueryParam(ledgerType)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartyId: cpId,
          amount: amt,
          ...(suggested != null && Number.isFinite(suggested)
            ? { previewSuggestedAmount: suggested }
            : {}),
        }),
      },
    );
    setNettingBusy(false);
    if (!res.ok) {
      setNettingErr(await res.text());
      return;
    }
    setNettingOpen(false);
    setNettingPreview(null);
    await runReport();
    alert(t("reconciliation.nettingOk"));
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;
  if (!ledgerReady) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("reconciliation.title")} subtitle={t("reconciliation.subtitle")} />

      {cpId && (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-4 shadow-sm max-w-3xl">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">
            {t("reconciliation.counterClaimsTitle")}
          </h2>
          <p className="text-xs text-slate-600 mb-3">{t("reconciliation.counterClaimsHint")}</p>
          {nettingLoad && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
          {!nettingLoad && netCandidate && (
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-slate-500 block text-xs">{t("reconciliation.nettingDr211")}</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatMoneyAzn(netCandidate.receivable)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">{t("reconciliation.nettingCr531")}</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatMoneyAzn(netCandidate.payable531)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">{t("reconciliation.nettingLimit")}</span>
                <span
                  className={`font-mono font-semibold ${netCandidate.canNet ? "text-emerald-800" : "text-slate-400"}`}
                >
                  {formatMoneyAzn(netCandidate.suggestedAmount)}
                </span>
              </div>
            </div>
          )}
          {!nettingLoad && netCandidate && !netCandidate.canNet && (
            <p className="text-xs text-amber-800 mt-2">{t("reconciliation.nettingNoBothSides")}</p>
          )}
        </div>
      )}

      <div className="flex flex-col lg:flex-row flex-wrap gap-4 items-end rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 min-w-[200px]">
          <span>{t("reconciliation.counterparty")}</span>
          <select
            value={cpId}
            onChange={(e) => setCpId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2"
          >
            <option value="">{t("reconciliation.cpPlaceholder")}</option>
            {counterparties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.taxId})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[#34495E]">
          <span>{t("reporting.from")}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`rounded-[2px] border bg-white px-2 py-1.5 text-sm ${BORDER_MUTED_CLASS}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-[#34495E]">
          <span>{t("reporting.to")}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`rounded-[2px] border bg-white px-2 py-1.5 text-sm ${BORDER_MUTED_CLASS}`}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runReport()}
          className="px-4 py-2 rounded-lg bg-action text-white text-sm font-medium hover:bg-action-hover disabled:opacity-50"
        >
          {loading ? "…" : t("reconciliation.run")}
        </button>
        <button
          type="button"
          disabled={pdfBusy || !cpId}
          onClick={() => void downloadPdf()}
          className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
        >
          {pdfBusy ? t("reconciliation.downloadPdfBusy") : t("reconciliation.downloadPdf")}
        </button>
        <button
          type="button"
          disabled={
            nettingBusy || !cpId || nettingLoad || !netCandidate?.canNet
          }
          onClick={() => void openNettingModal()}
          className="px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50 text-left leading-tight"
        >
          {nettingBusy && nettingOpen === false ? (
            t("reconciliation.nettingBusy")
          ) : (
            <>
              <span className="block">{t("reconciliation.nettingFormBtn")}</span>
              <span className="block text-[11px] font-semibold opacity-95 mt-0.5">
                {t("invoiceView.payByNetting")}
              </span>
              <span className="block text-[11px] font-normal opacity-90 mt-0.5">
                {t("reconciliation.nettingFormBtnAz")}
              </span>
            </>
          )}
        </button>
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}

      {nettingOpen && nettingPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200"
          >
            <h2 className="text-lg font-semibold text-gray-900">{t("reconciliation.nettingModalTitle")}</h2>
            <p className="text-sm text-slate-600">{t("reconciliation.nettingHint")}</p>
            <p className="text-sm">
              <span className="text-slate-500">{t("reconciliation.nettingDr")}:</span>{" "}
              <span className="font-mono font-medium">{formatMoneyAzn(nettingPreview.receivable)}</span>
            </p>
            <p className="text-sm">
              <span className="text-slate-500">{t("reconciliation.nettingCr")}:</span>{" "}
              <span className="font-mono font-medium">{formatMoneyAzn(nettingPreview.payable531)}</span>
            </p>
            <p className="text-sm">
              <span className="text-slate-500">{t("reconciliation.nettingSuggested")}:</span>{" "}
              <span className="font-mono font-semibold text-primary">
                {formatMoneyAzn(nettingPreview.suggestedAmount)}
              </span>
            </p>
            <label className="block text-sm font-medium text-slate-700">
              {t("reconciliation.nettingAmount")}
              <input
                type="number"
                min={0.0001}
                step="any"
                value={nettingAmount}
                onChange={(e) => setNettingAmount(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </label>
            {nettingErr && <p className="text-red-600 text-sm">{nettingErr}</p>}
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button
                type="button"
                disabled={nettingBusy}
                onClick={() => {
                  setNettingOpen(false);
                  setNettingPreview(null);
                  setNettingErr(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              >
                {t("reconciliation.nettingClose")}
              </button>
              <button
                type="button"
                disabled={nettingBusy}
                onClick={() => void submitNetting()}
                className="px-4 py-2 rounded-lg bg-action text-white text-sm font-medium hover:bg-action-hover disabled:opacity-50"
              >
                {nettingBusy ? t("reconciliation.nettingBusy") : t("reconciliation.nettingSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p>
              <span className="text-slate-500">{t("reconciliation.opening")}:</span>{" "}
              <span className="font-semibold text-gray-900">{formatMoneyAzn(data.openingBalance)}</span>
            </p>
            <p>
              <span className="text-slate-500">{t("reconciliation.turnoverDr")}:</span>{" "}
              <span className="font-semibold">{formatMoneyAzn(data.turnoverDebit)}</span>
            </p>
            <p>
              <span className="text-slate-500">{t("reconciliation.turnoverCr")}:</span>{" "}
              <span className="font-semibold">{formatMoneyAzn(data.turnoverCredit)}</span>
            </p>
            <p>
              <span className="text-slate-500">{t("reconciliation.closing")}:</span>{" "}
              <span className="font-semibold text-primary">{formatMoneyAzn(data.closingBalance)}</span>
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="text-sm min-w-full">
              <thead>
                <tr>
                  <th className="text-left p-2">{t("reconciliation.thDate")}</th>
                  <th className="text-left p-2">{t("reconciliation.thRef")}</th>
                  <th className="text-left p-2">{t("reconciliation.thDesc")}</th>
                  <th className="text-right p-2">{t("reconciliation.thDr")}</th>
                  <th className="text-right p-2">{t("reconciliation.thCr")}</th>
                  <th className="text-right p-2">{t("reconciliation.thBal")}</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((r, i) => (
                  <tr key={`${r.kind}-${r.date}-${i}`} className="border-t border-slate-100">
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2">{r.reference}</td>
                    <td className="p-2">{r.description}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(r.debit)}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(r.credit)}</td>
                    <td className="p-2 text-right font-mono font-medium">{formatMoneyAzn(r.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.methodologyNote && (
            <p className="text-xs text-slate-500 max-w-3xl">{data.methodologyNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
