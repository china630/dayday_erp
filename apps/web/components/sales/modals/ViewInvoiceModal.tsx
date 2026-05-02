"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import QRCode from "qrcode";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { formatInvoiceStatus } from "../../../lib/invoice-status";
import { ledgerQueryParam, useLedger } from "../../../lib/ledger-context";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { SignatureProviderMark } from "../../signature-provider-mark";
import { EntityAuditHistory } from "../../admin/entity-audit-history";
import {
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  MODAL_INPUT_NUMERIC_CLASS,
} from "../../../lib/design-system";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { SalesModalShell } from "./modal-shell";

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

export function ViewInvoiceModal({
  open,
  invoiceId,
  onClose,
  onInvoicesUpdated,
}: {
  open: boolean;
  invoiceId: string | null;
  onClose: () => void;
  /** Вызвать после изменения счёта (подпись, зачёт), чтобы обновить список. */
  onInvoicesUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const id = invoiceId ?? "";
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
    if (!open) {
      setInv(null);
      setError(null);
      setLoading(false);
      setViewTab("details");
      setSignOpen(false);
      setSignLogId(null);
      setSignMessage(null);
      setPollHint(null);
      setSimQrPayload(null);
      setSimQrDataUrl(null);
      setActiveSignProvider(null);
      setNetModal(false);
      return;
    }
    if (!ready || !token || !id) return;
    void load();
  }, [open, ready, token, id, load]);

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
        await load();
        onInvoicesUpdated?.();
      } else if (data.status === "AWAITING_MOBILE_CONFIRMATION") {
        setPollHint(t("invoiceView.signWaitingPhone"));
      }
    }, 1500);
    return () => window.clearInterval(tmr);
  }, [signLogId, token, id, load, t, onInvoicesUpdated]);

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
    await load();
    onInvoicesUpdated?.();
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

  async function handleShare() {
    if (!inv) return;
    setShareBusy(true);
    try {
      const path = `/sales/invoices?invoice=${encodeURIComponent(inv.id)}`;
      await navigator.clipboard.writeText(path);
      toast.success(t("invoiceView.sharePathCopied"));
    } catch {
      toast.error(t("invoiceView.sharePortalError"));
    } finally {
      setShareBusy(false);
    }
  }

  const showNettingCta =
    inv &&
    inv.revenueRecognized &&
    Number(inv.remaining) > 0 &&
    netPreview?.canNet;

  if (!ready || !token) return null;
  if (!ledgerReady) return null;

  const headerActions =
    !loading && inv ? (
      <>
        {inv.status === "LOCKED_BY_SIGNATURE" ? (
          <Badge variant="success">{formatInvoiceStatus(t, inv.status)}</Badge>
        ) : null}
        {canSign ? (
          <Button type="button" variant="primary" onClick={() => setSignOpen(true)}>
            {t("invoiceView.signWithEi")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={shareBusy}
          onClick={() => void handleShare()}
        >
          {shareBusy ? "…" : t("invoiceView.sharePortal")}
        </Button>
      </>
    ) : null;

  return (
    <>
      <SalesModalShell
        open={open && !!invoiceId}
        title={inv?.number ?? t("invoices.title")}
        subtitle={inv?.counterparty?.name}
        onClose={onClose}
        maxWidthClass="max-w-4xl"
        headerActions={headerActions}
      >
        <div className="space-y-4">
          {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
          {loading ? <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p> : null}

          {!loading && inv && (
            <>
              <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={viewTab === "details" ? "secondary" : "ghost"}
                className={viewTab === "details" ? "border-[#2980B9]" : ""}
                onClick={() => setViewTab("details")}
              >
                {t("invoiceView.tabDetails")}
              </Button>
              <Button
                type="button"
                variant={viewTab === "history" ? "secondary" : "ghost"}
                className={viewTab === "history" ? "border-[#2980B9]" : ""}
                onClick={() => setViewTab("history")}
              >
                {t("invoiceView.tabHistory")}
              </Button>
              </div>

              {viewTab === "history" ? (
              <section className="rounded-[2px] border border-[#D5DADF] bg-white p-4 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-[#34495E]">
                  {t("invoiceView.historyTitle")}
                </h2>
                <EntityAuditHistory entityType="Invoice" entityId={id} token={token} />
              </section>
              ) : null}

              {viewTab === "details" ? (
                <>
                <p className="m-0 text-[13px] text-[#7F8C8D]">
                  {inv.counterparty.name}
                  <span className="text-[#7F8C8D]"> · VÖEN {inv.counterparty.taxId}</span>
                  {completedSig && inv.status !== "LOCKED_BY_SIGNATURE" ? (
                    <span className="ml-2 inline-block align-middle">
                      <Badge variant="neutral">{t("invoiceView.signedBadge")}</Badge>
                    </span>
                  ) : null}
                </p>

                <div className="space-y-4 rounded-[2px] border border-[#D5DADF] bg-white p-4 text-[13px] shadow-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className="text-[#7F8C8D]">{t("invoices.status")}: </span>
                      <span className="font-medium">{formatInvoiceStatus(t, inv.status)}</span>
                    </div>
                    <div>
                      <span className="text-[#7F8C8D]">{t("invoices.due")}: </span>
                      <span>{String(inv.dueDate).slice(0, 10)}</span>
                    </div>
                    <div>
                      <span className="text-[#7F8C8D]">{t("invoices.amount")}: </span>
                      <span className="font-medium">
                        {formatMoneyAzn(inv.totalAmount)} {inv.currency}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#7F8C8D]">{t("invoices.remainingCol")}: </span>
                      <span>{formatMoneyAzn(inv.remaining)}</span>
                    </div>
                  </div>
                  {showNettingCta && (
                    <div className="mt-4 border-t border-[#D5DADF] pt-4">
                      <p className="mb-2 text-[13px] text-[#7F8C8D]">{t("invoiceView.payByNettingHint")}</p>
                      <Button type="button" variant="primary" onClick={() => openNettingModal()}>
                        {t("invoiceView.payByNetting")}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto rounded-[2px] border border-[#D5DADF] bg-white shadow-sm">
                  <table className={`${DATA_TABLE_CLASS} min-w-full`}>
                    <thead>
                      <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                        <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("invoiceNew.product")}</th>
                        <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("invoiceNew.quantity")}</th>
                        <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("invoices.amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.items.map((row) => (
                        <tr key={row.id} className={DATA_TABLE_TR_CLASS}>
                          <td className={`${DATA_TABLE_TD_CLASS} font-semibold`}>
                            {row.product?.name ?? row.description ?? "—"}
                          </td>
                          <td className={DATA_TABLE_TD_RIGHT_CLASS}>{String(row.quantity)}</td>
                          <td className={DATA_TABLE_TD_RIGHT_CLASS}>{formatMoneyAzn(row.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </SalesModalShell>

      {netModal && inv && netPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-[2px] border border-[#D5DADF] bg-white p-6 shadow-sm"
          >
            <div className="space-y-4">
              <h2 className="m-0 text-lg font-semibold text-[#34495E]">
                {t("invoiceView.payByNettingModalTitle")}
              </h2>
              <p className="text-[13px] text-[#7F8C8D]">{t("reconciliation.nettingHint")}</p>
              <p className="text-[13px] text-[#34495E]">
                <span className="text-[#7F8C8D]">{t("reconciliation.nettingDr")}:</span>{" "}
                <span className="font-mono tabular-nums">{formatMoneyAzn(netPreview.receivable)}</span>
              </p>
              <p className="text-[13px] text-[#34495E]">
                <span className="text-[#7F8C8D]">{t("reconciliation.nettingCr")}:</span>{" "}
                <span className="font-mono tabular-nums">{formatMoneyAzn(netPreview.payable531)}</span>
              </p>
              <label className="block">
                <span className={MODAL_FIELD_LABEL_CLASS}>{t("reconciliation.nettingAmount")}</span>
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  value={netAmount}
                  onChange={(e) => setNetAmount(e.target.value)}
                  className={`mt-1 ${MODAL_INPUT_NUMERIC_CLASS}`}
                />
              </label>
              {netErr ? <p className="text-[13px] text-red-600">{netErr}</p> : null}
            </div>
            <div className={MODAL_FOOTER_ACTIONS_CLASS}>
              <Button
                type="button"
                variant="ghost"
                disabled={netBusy}
                onClick={() => {
                  setNetModal(false);
                  setNetErr(null);
                }}
              >
                {t("reconciliation.nettingClose")}
              </Button>
              <Button type="button" variant="primary" disabled={netBusy} onClick={() => void submitNetting()}>
                {netBusy ? t("reconciliation.nettingBusy") : t("invoiceView.payByNettingSubmit")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {signOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-[2px] border border-[#D5DADF] bg-white p-6 shadow-sm">
            <div className="space-y-4">
              <h2 className="m-0 text-lg font-semibold text-[#34495E]">{t("invoiceView.signTitle")}</h2>
              <p className="text-[13px] text-[#7F8C8D]">{t("invoiceView.signPick")}</p>
              <div className="flex flex-col gap-4">
              <Button
                type="button"
                variant="secondary"
                disabled={signBusy || !!signLogId}
                className="h-auto min-h-0 justify-start py-3 text-left"
                onClick={() => void startSign("ASAN_IMZA")}
              >
                <span className="flex w-full items-center gap-3">
                  <SignatureProviderMark provider="ASAN_IMZA" className="!p-2 !border-0 shadow-none" />
                  <span className="text-[13px] font-semibold text-[#34495E]">{t("invoiceView.signWithAsan")}</span>
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={signBusy || !!signLogId}
                className="h-auto min-h-0 justify-start py-3 text-left"
                onClick={() => void startSign("SIMA")}
              >
                <span className="flex w-full items-center gap-3">
                  <SignatureProviderMark provider="SIMA" className="!p-2 !border-0 shadow-none" />
                  <span className="text-[13px] font-semibold text-[#34495E]">{t("invoiceView.signWithSima")}</span>
                </span>
              </Button>
              </div>
              {activeSignProvider === "SIMA" && simQrPayload && (
              <div className="flex flex-col items-center gap-3 rounded-[2px] border border-[#2980B9]/25 bg-[#2980B9]/10 p-4">
                <p className="text-center text-[13px] text-[#34495E]">{t("invoiceView.signSimaQrHint")}</p>
                {simQrDataUrl ? (
                  <img
                    src={simQrDataUrl}
                    alt=""
                    className="h-[220px] w-[220px] rounded-[2px] border border-white bg-white p-2 shadow-md"
                  />
                ) : (
                  <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p>
                )}
              </div>
              )}
              {signMessage ? (
                <p className="rounded-[2px] border border-amber-200 bg-amber-50 p-3 text-[13px] text-[#34495E]">
                  {signMessage}
                </p>
              ) : null}
              {pollHint ? <p className="text-[13px] text-[#2980B9]">{pollHint}</p> : null}
            </div>
            <div className={MODAL_FOOTER_ACTIONS_CLASS}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSignOpen(false);
                  setSignLogId(null);
                  setSignMessage(null);
                  setPollHint(null);
                  setSimQrPayload(null);
                  setSimQrDataUrl(null);
                  setActiveSignProvider(null);
                }}
              >
                {t("invoices.payCancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
