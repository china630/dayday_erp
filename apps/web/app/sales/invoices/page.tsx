"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { subscribeListRefresh } from "../../../lib/list-refresh-bus";
import { CheckCircle2, Eye, FileStack, Loader2, Send, SendHorizontal, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import {
  DATA_TABLE_ACTIONS_TD_CLASS,
  DATA_TABLE_ACTIONS_TH_CLASS,
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CENTER_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_CENTER_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  PRIMARY_BUTTON_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
} from "../../../lib/design-system";
import { formatInvoiceStatus } from "../../../lib/invoice-status";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/empty-state";
import { CreateInvoiceModal, ViewInvoiceModal } from "../../../components/sales/modals";

type Row = {
  id: string;
  number: string;
  status: string;
  dueDate: string;
  totalAmount: unknown;
  paidTotal?: string;
  remaining?: string;
  counterparty: { name: string };
};

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const search = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [payForId, setPayForId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [invoiceActionBusy, setInvoiceActionBusy] = useState<string | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  const invoiceFromUrl = search.get("invoice");
  useEffect(() => {
    if (invoiceFromUrl) setViewInvoiceId(invoiceFromUrl);
    else setViewInvoiceId(null);
  }, [invoiceFromUrl]);

  function openInvoiceView(id: string) {
    setViewInvoiceId(id);
    router.replace(`/sales/invoices?invoice=${encodeURIComponent(id)}`, {
      scroll: false,
    });
  }

  function closeInvoiceView() {
    setViewInvoiceId(null);
    const params = new URLSearchParams(search.toString());
    params.delete("invoice");
    const qs = params.toString();
    router.replace(qs ? `/sales/invoices?${qs}` : "/sales/invoices", { scroll: false });
  }

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/invoices");
    if (!res.ok) {
      setError(`${t("invoices.loadError")}: ${res.status}`);
      setRows([]);
    } else {
      setRows(await res.json());
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    if (!ready || !token) return;
    return subscribeListRefresh("invoices", () => void load());
  }, [load, ready, token]);

  useEffect(() => {
    if (loading) return;
    if (!rows.length) return;
    if (payForId) return;
    if (search?.get("pay") !== "1") return;
    const firstPayable = rows.find((r) => r.status === "SENT" || r.status === "PARTIALLY_PAID");
    if (firstPayable) openPay(firstPayable);
  }, [loading, rows, payForId, search]);

  async function patchStatus(id: string, status: "SENT" | "PAID") {
    const key = `${id}:${status}`;
    setInvoiceActionBusy(key);
    try {
      const res = await apiFetch(`/api/invoices/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      setPayForId(null);
      await load();
    } finally {
      setInvoiceActionBusy((b) => (b === key ? null : b));
    }
  }

  async function submitPartialPayment(id: string) {
    const amt = Number(payAmount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) {
      alert(t("invoices.payAmountInvalid"));
      return;
    }
    setPaySubmitting(true);
    const body: { amount: number; paymentDate?: string } = { amount: amt };
    if (payDate.trim()) body.paymentDate = payDate.trim();
    const res = await apiFetch(`/api/invoices/${id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPaySubmitting(false);
    if (!res.ok) return;
    setPayForId(null);
    setPayAmount("");
    setPayDate("");
    await load();
  }

  function openPay(row: Row) {
    setPayForId(row.id);
    setPayAmount(row.remaining ?? "");
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  async function sendEmail(id: string) {
    const key = `email:${id}`;
    setInvoiceActionBusy(key);
    try {
      const res = await apiFetch(`/api/invoices/${id}/send-email`, {
        method: "POST",
      });
      if (!res.ok) return;
      alert(t("invoices.emailSent"));
    } finally {
      setInvoiceActionBusy((b) => (b === key ? null : b));
    }
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (!token) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("invoices.title")}
        actions={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setCreateOpen(true)}>
            + {t("invoices.new")}
          </button>
        }
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && rows.length === 0 && !error && (
        <EmptyState
          title={t("invoices.none")}
          description={t("invoices.emptyHint")}
          icon={
            <FileStack className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />
          }
          action={
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setCreateOpen(true)}>
              + {t("invoices.new")}
            </button>
          }
        />
      )}
      {!loading && rows.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-[2px] border border-[#D5DADF] bg-white p-4 shadow-sm text-[13px] space-y-2"
              >
                <div className="font-semibold text-[#34495E]">{r.number}</div>
                <div className="text-[#34495E]">{r.counterparty.name}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[#34495E]">
                  <span>
                    {t("invoices.status")}: {formatInvoiceStatus(t, r.status)}
                  </span>
                  <span>
                    {t("invoices.due")}: {String(r.dueDate).slice(0, 10)}
                  </span>
                </div>
                <div className="text-right font-mono tabular-nums">
                  {t("invoices.amount")}: {formatMoneyAzn(r.totalAmount)}
                </div>
                {r.paidTotal != null && (
                  <div className="text-[13px] text-right font-mono tabular-nums">
                    {t("invoices.paidCol")}: {formatMoneyAzn(r.paidTotal)}
                  </div>
                )}
                {r.remaining != null && (
                  <div className="text-[13px] font-medium text-right font-mono tabular-nums">
                    {t("invoices.remainingCol")}: {formatMoneyAzn(r.remaining)}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-end gap-1 pt-2">
                  <button
                    type="button"
                    className={TABLE_ROW_ICON_BTN_CLASS}
                    title={t("invoices.view")}
                    onClick={() => openInvoiceView(r.id)}
                  >
                    <Eye className="h-4 w-4 text-[#2980B9]" aria-hidden />
                  </button>
                  {r.status === "DRAFT" && (
                    <>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className={TABLE_ROW_ICON_BTN_CLASS}
                        title={t("invoices.sent")}
                        onClick={() => void patchStatus(r.id, "SENT")}
                      >
                        {invoiceActionBusy === `${r.id}:SENT` ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                        ) : (
                          <SendHorizontal className="h-4 w-4 text-[#2980B9]" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className={TABLE_ROW_ICON_BTN_CLASS}
                        title={t("invoices.payFull")}
                        onClick={() => void patchStatus(r.id, "PAID")}
                      >
                        {invoiceActionBusy === `${r.id}:PAID` ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-[#2980B9]" aria-hidden />
                        )}
                      </button>
                    </>
                  )}
                  {(r.status === "SENT" || r.status === "PARTIALLY_PAID") && (
                    <>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className={TABLE_ROW_ICON_BTN_CLASS}
                        title={t("invoices.partialPay")}
                        onClick={() => openPay(r)}
                      >
                        <Wallet className="h-4 w-4 text-[#2980B9]" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className={TABLE_ROW_ICON_BTN_CLASS}
                        title={t("invoices.payFull")}
                        onClick={() => void patchStatus(r.id, "PAID")}
                      >
                        {invoiceActionBusy === `${r.id}:PAID` ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-[#2980B9]" aria-hidden />
                        )}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={invoiceActionBusy !== null}
                    className={TABLE_ROW_ICON_BTN_CLASS}
                    title={t("invoices.sendEmail")}
                    onClick={() => void sendEmail(r.id)}
                  >
                    {invoiceActionBusy === `email:${r.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4 text-[#2980B9]" aria-hidden />
                    )}
                  </button>
                </div>
                {payForId === r.id && (
                  <div className="pt-3 border-t border-[#D5DADF] flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-[13px] w-28"
                      placeholder={t("invoices.payAmount")}
                    />
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-[13px]"
                    />
                    <button
                      type="button"
                      disabled={paySubmitting}
                      onClick={() => void submitPartialPayment(r.id)}
                      className={`${PRIMARY_BUTTON_CLASS} px-3 text-[13px]`}
                    >
                      {paySubmitting ? "…" : t("invoices.paySubmit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayForId(null)}
                      className="px-3 py-1.5 rounded-[2px] border border-[#D5DADF] text-[13px]"
                    >
                      {t("invoices.payCancel")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={`hidden md:block ${DATA_TABLE_VIEWPORT_CLASS}`}>
            <table className={`${DATA_TABLE_CLASS} min-w-[720px]`}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("invoices.number")}</th>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("invoices.counterparty")}</th>
                  <th className={DATA_TABLE_TH_CENTER_CLASS}>{t("invoices.status")}</th>
                  <th className={`hidden lg:table-cell ${DATA_TABLE_TH_RIGHT_CLASS}`}>
                    {t("invoices.due")}
                  </th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("invoices.amount")}</th>
                  <th className={`hidden xl:table-cell ${DATA_TABLE_TH_RIGHT_CLASS}`}>
                    {t("invoices.paidCol")}
                  </th>
                  <th className={`hidden xl:table-cell ${DATA_TABLE_TH_RIGHT_CLASS}`}>
                    {t("invoices.remainingCol")}
                  </th>
                  <th
                    className={`${DATA_TABLE_TH_RIGHT_CLASS} min-w-[200px] w-[200px]`}
                  >
                    {t("invoices.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className={DATA_TABLE_TR_CLASS}>
                      <td className={`${DATA_TABLE_TD_CLASS} font-semibold text-[#34495E]`}>
                        {r.number}
                      </td>
                      <td className={DATA_TABLE_TD_CLASS}>{r.counterparty.name}</td>
                      <td className={DATA_TABLE_TD_CENTER_CLASS}>
                        {formatInvoiceStatus(t, r.status)}
                      </td>
                      <td className={`hidden lg:table-cell ${DATA_TABLE_TD_RIGHT_CLASS}`}>
                        {String(r.dueDate).slice(0, 10)}
                      </td>
                      <td className={DATA_TABLE_TD_RIGHT_CLASS}>
                        {formatMoneyAzn(r.totalAmount)}
                      </td>
                      <td className={`hidden xl:table-cell ${DATA_TABLE_TD_RIGHT_CLASS}`}>
                        {r.paidTotal != null ? formatMoneyAzn(r.paidTotal) : "—"}
                      </td>
                      <td className={`hidden xl:table-cell ${DATA_TABLE_TD_RIGHT_CLASS}`}>
                        {r.remaining != null ? formatMoneyAzn(r.remaining) : "—"}
                      </td>
                      <td className={`${DATA_TABLE_ACTIONS_TD_CLASS} min-w-[200px] w-[200px]`}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className={TABLE_ROW_ICON_BTN_CLASS}
                            title={t("invoices.view")}
                            onClick={() => openInvoiceView(r.id)}
                          >
                            <Eye className="h-4 w-4 text-[#2980B9]" aria-hidden />
                          </button>
                          {r.status === "DRAFT" && (
                            <>
                              <button
                                type="button"
                                disabled={invoiceActionBusy !== null}
                                className={TABLE_ROW_ICON_BTN_CLASS}
                                title={t("invoices.sent")}
                                onClick={() => void patchStatus(r.id, "SENT")}
                              >
                                {invoiceActionBusy === `${r.id}:SENT` ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                                ) : (
                                  <SendHorizontal className="h-4 w-4 text-[#2980B9]" aria-hidden />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={invoiceActionBusy !== null}
                                className={TABLE_ROW_ICON_BTN_CLASS}
                                title={t("invoices.payFull")}
                                onClick={() => void patchStatus(r.id, "PAID")}
                              >
                                {invoiceActionBusy === `${r.id}:PAID` ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-[#2980B9]" aria-hidden />
                                )}
                              </button>
                            </>
                          )}
                          {(r.status === "SENT" || r.status === "PARTIALLY_PAID") && (
                            <>
                              <button
                                type="button"
                                disabled={invoiceActionBusy !== null}
                                className={TABLE_ROW_ICON_BTN_CLASS}
                                title={t("invoices.partialPay")}
                                onClick={() => openPay(r)}
                              >
                                <Wallet className="h-4 w-4 text-[#2980B9]" aria-hidden />
                              </button>
                              <button
                                type="button"
                                disabled={invoiceActionBusy !== null}
                                className={TABLE_ROW_ICON_BTN_CLASS}
                                title={t("invoices.payFull")}
                                onClick={() => void patchStatus(r.id, "PAID")}
                              >
                                {invoiceActionBusy === `${r.id}:PAID` ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-[#2980B9]" aria-hidden />
                                )}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={invoiceActionBusy !== null}
                            className={TABLE_ROW_ICON_BTN_CLASS}
                            title={t("invoices.sendEmail")}
                            onClick={() => void sendEmail(r.id)}
                          >
                            {invoiceActionBusy === `email:${r.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#2980B9]" aria-hidden />
                            ) : (
                              <Send className="h-4 w-4 text-[#2980B9]" aria-hidden />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {payForId === r.id && (
                      <tr className={`${DATA_TABLE_TR_CLASS} bg-[#F8FAFC]`}>
                        <td colSpan={8} className={`${DATA_TABLE_TD_CLASS} p-4`}>
                          <div className="flex flex-wrap items-end gap-3 max-w-xl">
                            <label className="flex flex-col gap-1 text-xs font-semibold text-[#475569]">
                              {t("invoices.payAmount")}
                              <input
                                type="text"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                className="border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-[13px] w-36"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-semibold text-[#475569]">
                              {t("invoices.payDate")}
                              <input
                                type="date"
                                value={payDate}
                                onChange={(e) => setPayDate(e.target.value)}
                                className="border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-[13px]"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={paySubmitting}
                              onClick={() => void submitPartialPayment(r.id)}
                              className={`${PRIMARY_BUTTON_CLASS} px-3 text-[13px]`}
                            >
                              {paySubmitting ? "…" : t("invoices.paySubmit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPayForId(null)}
                              className="px-3 py-1.5 rounded-[2px] border border-[#D5DADF] text-[13px]"
                            >
                              {t("invoices.payCancel")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ViewInvoiceModal
        open={!!viewInvoiceId}
        invoiceId={viewInvoiceId}
        onClose={closeInvoiceView}
        onInvoicesUpdated={() => void load()}
      />
    </div>
  );
}
