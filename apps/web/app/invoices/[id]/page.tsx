"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { ledgerQueryParam, useLedger } from "../../../lib/ledger-context";
import { useRequireAuth } from "../../../lib/use-require-auth";
import QRCode from "qrcode";
import { SignatureProviderMark } from "../../../components/signature-provider-mark";
import { PageHeader } from "../../../components/layout/page-header";
import { SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";
import { EntityAuditHistory } from "../../../components/admin/entity-audit-history";

type SignatureLog = {
  id: string;
  status: string;
  provider: string;
  signedAt: string | null;
  certificateSubject: string | null;
};

type InvoiceDetail = {
  id: string;
  number: string;
  status: string;
  dueDate: string;
  totalAmount: unknown;
  currency: string;
  paidTotal: string;
  remaining: string;
  counterpartyId: string;
  revenueRecognized: boolean;
  counterparty: { name: string; taxId: string; email: string | null };
  items: Array<{
    id: string;
    quantity: unknown;
    unitPrice: unknown;
    vatRate: unknown;
    lineTotal: unknown;
    description: string | null;
    product: { name: string; sku: string } | null;
  }>;
  signatureLogs: SignatureLog[];
};

type NettingPreview = {
  receivable: string;
  payable531: string;
  suggestedAmount: string;
  canNet: boolean;
};

export default function InvoiceViewPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signOpen, setSignOpen] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [signLogId, setSignLogId] = useState<string | null>(null);
  const [signMessage, setSignMessage] = useState<string | null>(null);
  const [pollHint, setPollHint] = useState<string | null>(null);
  const [simQrPayload, setSimQrPayload] = useState<string | null>(null);
  const [simQrDataUrl, setSimQrDataUrl] = useState<string | null>(null);
  const [activeSignProvider, setActiveSignProvider] = useState<
    "ASAN_IMZA" | "SIMA" | null
  >(null);
  const [netPreview, setNetPreview] = useState<NettingPreview | null>(null);
  const [netModal, setNetModal] = useState(false);
  const [netAmount, setNetAmount] = useState("");
  const [netBusy, setNetBusy] = useState(false);
  const [netErr, setNetErr] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<"details" | "history">("details");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) {
      setInv(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch(`/api/invoices/${id}`);
    if (!res.ok) {
      setError(`${t("invoiceView.loadError")}: ${res.status}`);
      setInv(null);
    } else {
      setInv((await res.json()) as InvoiceDetail);
    }
    setLoading(false);
  }, [token, id, t]);

  useEffect(() => {
    if (!ready || !token || !id) return;
    void load();
  }, [load, ready, token, id]);

  useEffect(() => {
    if (!token || !inv || !ledgerReady) {
      setNetPreview(null);
      return;
    }
    if (!inv.revenueRecognized) {
      setNetPreview(null);
      return;
    }
    const rem = Number(inv.remaining);
    if (!Number.isFinite(rem) || rem <= 0) {
      setNetPreview(null);
      return;
    }
    let cancelled = false;
    const q = new URLSearchParams({
      counterpartyId: inv.counterpartyId,
      ledgerType,
    });
    void apiFetch(`/api/reporting/netting/preview?${q.toString()}`).then(
      async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setNetPreview(null);
          return;
        }
        setNetPreview((await res.json()) as NettingPreview);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, inv, ledgerType, ledgerReady]);

  const completedSig = useMemo(
    () => inv?.signatureLogs.find((l) => l.status === "COMPLETED"),
    [inv?.signatureLogs],
  );

  const canSign =
    inv &&
    inv.status !== "CANCELLED" &&
    inv.status !== "LOCKED_BY_SIGNATURE" &&
    !completedSig;

  useEffect(() => {
    if (!signLogId || !token || !id) return;
    const tmr = window.setInterval(async () => {
      const res = await apiFetch(`/api/invoices/${id}/signature/${signLogId}/status`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        status: string;
        simQrPayload?: string;
      };
      if (data.simQrPayload) setSimQrPayload(data.simQrPayload);
      if (data.status === "COMPLETED") {
        setPollHint(t("invoiceView.signCompleted"));
        setSignLogId(null);
        setSignOpen(false);
        setSimQrPayload(null);
        setSimQrDataUrl(null);
        setActiveSignProvider(null);
        void load();
      } else if (data.status === "AWAITING_MOBILE_CONFIRMATION") {
        setPollHint(t("invoiceView.signWaitingPhone"));
      }
    }, 1500);
    return () => window.clearInterval(tmr);
  }, [signLogId, token, id, load, t]);

  useEffect(() => {
    if (!simQrPayload) {
      setSimQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(simQrPayload, { width: 220, margin: 2 }).then(
      (url) => {
        if (!cancelled) setSimQrDataUrl(url);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [simQrPayload]);

  function openNettingModal() {
    if (!inv || !netPreview?.canNet) return;
    const rem = Number(inv.remaining);
    const cap = Number(netPreview.suggestedAmount);
    const def = Math.min(
      Number.isFinite(rem) ? rem : 0,
      Number.isFinite(cap) ? cap : 0,
    );
    setNetAmount(String(def > 0 ? def : ""));
    setNetErr(null);
    setNetModal(true);
  }

  async function submitNetting() {
    if (!token || !inv) return;
    const amt = Number(netAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setNetErr(t("reconciliation.nettingAmountInvalid"));
      return;
    }
    setNetBusy(true);
    setNetErr(null);
    const res = await apiFetch(
      `/api/reporting/netting?${ledgerQueryParam(ledgerType)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterpartyId: inv.counterpartyId, amount: amt }),
      },
    );
    setNetBusy(false);
    if (!res.ok) {
      setNetErr(await res.text());
      return;
    }
    setNetModal(false);
    void load();
  }

  async function startSign(provider: "ASAN_IMZA" | "SIMA") {
    if (!id) return;
    setSignBusy(true);
    setSignMessage(null);
    setPollHint(null);
    setSimQrPayload(null);
    setSimQrDataUrl(null);
    setActiveSignProvider(provider);
    const res = await apiFetch(`/api/invoices/${id}/signature/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    setSignBusy(false);
    if (!res.ok) {
      const text = await res.text();
      setSignMessage(`${t("invoiceView.signError")}: ${res.status} ${text}`);
      setActiveSignProvider(null);
      return;
    }
    const body = (await res.json()) as {
      signatureLogId: string;
      message?: string;
      simQrPayload?: string;
    };
    setSignLogId(body.signatureLogId);
    setSignMessage(body.message ?? null);
    setPollHint(t("invoiceView.signWaitingPhone"));
    setSimQrPayload(body.simQrPayload ?? null);
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

  const showNettingCta =
    inv &&
    inv.revenueRecognized &&
    Number(inv.remaining) > 0 &&
    netPreview?.canNet;

  const sharePortalLink = async () => {
    if (!token || !id) return;
    setShareBusy(true);
    setShareFeedback(null);
    try {
      const res = await apiFetch(`/api/invoices/${id}/portal-link`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { url: string };
      await navigator.clipboard.writeText(j.url);
      setShareFeedback({ kind: "ok", text: t("invoiceView.sharePortalCopied") });
      window.setTimeout(() => setShareFeedback(null), 4000);
    } catch {
      setShareFeedback({ kind: "err", text: t("invoiceView.sharePortalError") });
      window.setTimeout(() => setShareFeedback(null), 5000);
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={inv?.number ?? t("invoices.title")}
        subtitle={inv?.counterparty?.name}
        actions={
          <Link href="/invoices" className={SECONDARY_BUTTON_CLASS}>
            ← {t("invoiceView.backList")}
          </Link>
        }
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {shareFeedback && (
        <p
          className={
            shareFeedback.kind === "err"
              ? "text-sm text-red-600"
              : "text-sm text-emerald-700"
          }
        >
          {shareFeedback.text}
        </p>
      )}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

      {!loading && inv && (
        <>
          <div className="flex flex-wrap gap-2 border-b border-[#D5DADF] pb-2">
            <button
              type="button"
              onClick={() => setViewTab("details")}
              className={`text-sm font-medium px-3 py-1.5 rounded border ${
                viewTab === "details"
                  ? "bg-white text-[#34495E] border-[#2980B9]"
                  : "bg-transparent text-[#7F8C8D] border-transparent hover:border-[#D5DADF]"
              }`}
            >
              {t("invoiceView.tabDetails")}
            </button>
            <button
              type="button"
              onClick={() => setViewTab("history")}
              className={`text-sm font-medium px-3 py-1.5 rounded border ${
                viewTab === "history"
                  ? "bg-white text-[#34495E] border-[#2980B9]"
                  : "bg-transparent text-[#7F8C8D] border-transparent hover:border-[#D5DADF]"
              }`}
            >
              {t("invoiceView.tabHistory")}
            </button>
          </div>

          {viewTab === "history" ? (
            <section className="rounded-lg border border-[#D5DADF] bg-white p-4">
              <h2 className="text-sm font-semibold text-[#34495E] mb-3">
                {t("invoiceView.historyTitle")}
              </h2>
              <EntityAuditHistory entityType="Invoice" entityId={id} token={token} />
            </section>
          ) : null}

          {viewTab === "details" ? (
            <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-2xl font-semibold text-gray-900">{inv.number}</h2>
              <p className="mt-1 text-slate-600">{inv.counterparty.name}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {inv.status === "LOCKED_BY_SIGNATURE" && (
                <span className="text-xs font-semibold px-2 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200">
                  {t("invoiceView.lockedBadge")}
                </span>
              )}
              {completedSig && (
                <span className="text-xs font-medium px-2 py-1 rounded-md bg-slate-100 text-slate-800">
                  {t("invoiceView.signedBadge")}
                </span>
              )}
              {canSign && (
                <button
                  type="button"
                  onClick={() => setSignOpen(true)}
                  className="inline-flex items-center justify-center bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium shadow-sm"
                >
                  {t("invoiceView.sign")}
                </button>
              )}
              <button
                type="button"
                disabled={shareBusy}
                onClick={() => void sharePortalLink()}
                className="inline-flex items-center justify-center border border-[#2980B9] text-[#2980B9] bg-white px-4 py-2 rounded-lg hover:bg-slate-50 text-sm font-medium shadow-sm disabled:opacity-50"
              >
                {shareBusy ? "…" : t("invoiceView.sharePortal")}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm p-6 text-sm space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500">{t("invoices.status")}: </span>
                <span className="font-medium">{inv.status}</span>
              </div>
              <div>
                <span className="text-slate-500">{t("invoices.due")}: </span>
                <span>{String(inv.dueDate).slice(0, 10)}</span>
              </div>
              <div>
                <span className="text-slate-500">{t("invoices.amount")}: </span>
                <span className="font-medium">
                  {formatMoneyAzn(inv.totalAmount)} {inv.currency}
                </span>
              </div>
              <div>
                <span className="text-slate-500">{t("invoices.remainingCol")}: </span>
                <span>{formatMoneyAzn(inv.remaining)}</span>
              </div>
            </div>
            {showNettingCta && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-600 mb-2">{t("invoiceView.payByNettingHint")}</p>
                <button
                  type="button"
                  onClick={() => openNettingModal()}
                  className="inline-flex items-center justify-center bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-800 text-sm font-medium shadow-sm"
                >
                  {t("invoiceView.payByNetting")}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">{t("invoiceNew.product")}</th>
                  <th className="p-3">{t("invoiceNew.quantity")}</th>
                  <th className="p-3">{t("invoices.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-3">
                      {row.product?.name ?? row.description ?? "—"}
                    </td>
                    <td className="p-3">{String(row.quantity)}</td>
                    <td className="p-3">{formatMoneyAzn(row.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </>
          ) : null}
        </>
      )}

      {netModal && inv && netPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200"
          >
            <h2 className="text-lg font-semibold text-gray-900">
              {t("invoiceView.payByNettingModalTitle")}
            </h2>
            <p className="text-xs text-slate-600">
              {t("reconciliation.nettingHint")}
            </p>
            <p className="text-sm">
              <span className="text-slate-500">{t("reconciliation.nettingDr")}:</span>{" "}
              <span className="font-mono">{formatMoneyAzn(netPreview.receivable)}</span>
            </p>
            <p className="text-sm">
              <span className="text-slate-500">{t("reconciliation.nettingCr")}:</span>{" "}
              <span className="font-mono">{formatMoneyAzn(netPreview.payable531)}</span>
            </p>
            <label className="block text-sm font-medium text-slate-700">
              {t("reconciliation.nettingAmount")}
              <input
                type="number"
                min={0.0001}
                step="any"
                value={netAmount}
                onChange={(e) => setNetAmount(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2"
              />
            </label>
            {netErr && <p className="text-red-600 text-sm">{netErr}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                disabled={netBusy}
                onClick={() => {
                  setNetModal(false);
                  setNetErr(null);
                }}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
              >
                {t("reconciliation.nettingClose")}
              </button>
              <button
                type="button"
                disabled={netBusy}
                onClick={() => void submitNetting()}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
              >
                {netBusy ? t("reconciliation.nettingBusy") : t("invoiceView.payByNettingSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {signOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("invoiceView.signTitle")}
            </h2>
            <p className="text-sm text-slate-600">{t("invoiceView.signPick")}</p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={signBusy || !!signLogId}
                onClick={() => void startSign("ASAN_IMZA")}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-emerald-300/60 bg-emerald-50/90 text-left hover:bg-emerald-100/90 disabled:opacity-50 transition-colors"
              >
                <SignatureProviderMark provider="ASAN_IMZA" className="!p-2 !border-0 shadow-none" />
                <span className="font-semibold text-emerald-950">
                  {t("invoiceView.signWithAsan")}
                </span>
              </button>
              <button
                type="button"
                disabled={signBusy || !!signLogId}
                onClick={() => void startSign("SIMA")}
                className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-action/40 bg-action/10 text-left hover:bg-action/15 disabled:opacity-50 transition-colors"
              >
                <SignatureProviderMark provider="SIMA" className="!p-2 !border-0 shadow-none" />
                <span className="font-semibold text-primary">
                  {t("invoiceView.signWithSima")}
                </span>
              </button>
            </div>
            {activeSignProvider === "SIMA" && simQrPayload && (
              <div className="rounded-xl border border-action/25 bg-action/10 p-4 flex flex-col items-center gap-3">
                <p className="text-sm text-center text-primary">
                  {t("invoiceView.signSimaQrHint")}
                </p>
                {simQrDataUrl ? (
                  <img
                    src={simQrDataUrl}
                    alt=""
                    className="rounded-lg border border-white shadow-md bg-white p-2 w-[220px] h-[220px]"
                  />
                ) : (
                  <p className="text-xs text-muted">{t("common.loading")}</p>
                )}
              </div>
            )}
            {signMessage && (
              <p className="text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
                {signMessage}
              </p>
            )}
            {pollHint && (
              <p className="text-sm text-emerald-800">{pollHint}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setSignOpen(false);
                setSignLogId(null);
                setSignMessage(null);
                setPollHint(null);
                setSimQrPayload(null);
                setSimQrDataUrl(null);
                setActiveSignProvider(null);
              }}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              {t("invoices.payCancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
