"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { FileStack } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api-client";
import { PRIMARY_BUTTON_CLASS } from "../../lib/design-system";
import { formatMoneyAzn } from "../../lib/format-money";
import { useRequireAuth } from "../../lib/use-require-auth";
import { ModulePageLinks } from "../../components/module-page-links";
import { EmptyState } from "../../components/empty-state";

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
  const search = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payForId, setPayForId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [invoiceActionBusy, setInvoiceActionBusy] = useState<string | null>(null);

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
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/counterparties", labelKey: "nav.counterparties" },
          { href: "/products", labelKey: "nav.products" },
          { href: "/banking", labelKey: "nav.banking" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("invoices.title")}</h1>
        </div>
        <Link href="/invoices/new" className={PRIMARY_BUTTON_CLASS}>
          + {t("invoices.new")}
        </Link>
      </div>

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
            <Link href="/invoices/new" className={PRIMARY_BUTTON_CLASS}>
              + {t("invoices.new")}
            </Link>
          }
        />
      )}
      {!loading && rows.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm text-sm space-y-2"
              >
                <div className="font-semibold text-gray-900">{r.number}</div>
                <div className="text-slate-600">{r.counterparty.name}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span>{t("invoices.status")}: {r.status}</span>
                  <span>
                    {t("invoices.due")}: {String(r.dueDate).slice(0, 10)}
                  </span>
                </div>
                <div>{t("invoices.amount")}: {formatMoneyAzn(r.totalAmount)}</div>
                {r.paidTotal != null && (
                  <div className="text-xs">
                    {t("invoices.paidCol")}: {formatMoneyAzn(r.paidTotal)}
                  </div>
                )}
                {r.remaining != null && (
                  <div className="text-xs font-medium">
                    {t("invoices.remainingCol")}: {formatMoneyAzn(r.remaining)}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    href={`/invoices/${r.id}`}
                    className="text-xs px-2 py-1 rounded-md border border-action/25 text-primary bg-action/10 hover:bg-action/15"
                  >
                    {t("invoices.view")}
                  </Link>
                  {r.status === "DRAFT" && (
                    <>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className="text-xs px-2 py-1 rounded-md border border-slate-200 disabled:opacity-50"
                        onClick={() => void patchStatus(r.id, "SENT")}
                      >
                        {invoiceActionBusy === `${r.id}:SENT` ? "…" : t("invoices.sent")}
                      </button>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className="text-xs px-2 py-1 rounded-md border border-slate-200 disabled:opacity-50"
                        onClick={() => void patchStatus(r.id, "PAID")}
                      >
                        {invoiceActionBusy === `${r.id}:PAID` ? "…" : t("invoices.payFull")}
                      </button>
                    </>
                  )}
                  {(r.status === "SENT" || r.status === "PARTIALLY_PAID") && (
                    <>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className="text-xs px-2 py-1 rounded-md border border-amber-200 bg-amber-50 disabled:opacity-50"
                        onClick={() => openPay(r)}
                      >
                        {t("invoices.partialPay")}
                      </button>
                      <button
                        type="button"
                        disabled={invoiceActionBusy !== null}
                        className="text-xs px-2 py-1 rounded-md border border-slate-200 disabled:opacity-50"
                        onClick={() => void patchStatus(r.id, "PAID")}
                      >
                        {invoiceActionBusy === `${r.id}:PAID` ? "…" : t("invoices.payFull")}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={invoiceActionBusy !== null}
                    className="text-xs px-2 py-1 rounded-md border border-slate-200 disabled:opacity-50"
                    onClick={() => void sendEmail(r.id)}
                  >
                    {invoiceActionBusy === `email:${r.id}` ? "…" : t("invoices.sendEmail")}
                  </button>
                </div>
                {payForId === r.id && (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-28"
                      placeholder={t("invoices.payAmount")}
                    />
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      disabled={paySubmitting}
                      onClick={() => void submitPartialPayment(r.id)}
                      className={`${PRIMARY_BUTTON_CLASS} px-3 text-xs`}
                    >
                      {paySubmitting ? "…" : t("invoices.paySubmit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayForId(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                    >
                      {t("invoices.payCancel")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th>{t("invoices.number")}</th>
                  <th>{t("invoices.counterparty")}</th>
                  <th>{t("invoices.status")}</th>
                  <th className="hidden lg:table-cell">{t("invoices.due")}</th>
                  <th>{t("invoices.amount")}</th>
                  <th className="hidden xl:table-cell">{t("invoices.paidCol")}</th>
                  <th className="hidden xl:table-cell">{t("invoices.remainingCol")}</th>
                  <th>{t("invoices.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="font-medium text-gray-900">{r.number}</td>
                      <td>{r.counterparty.name}</td>
                      <td>{r.status}</td>
                      <td className="hidden lg:table-cell">
                        {String(r.dueDate).slice(0, 10)}
                      </td>
                      <td>{formatMoneyAzn(r.totalAmount)}</td>
                      <td className="hidden xl:table-cell">
                        {r.paidTotal != null ? formatMoneyAzn(r.paidTotal) : "—"}
                      </td>
                      <td className="hidden xl:table-cell">
                        {r.remaining != null ? formatMoneyAzn(r.remaining) : "—"}
                      </td>
                      <td>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/invoices/${r.id}`}
                          className="text-sm px-2 py-1 rounded-md border border-action/25 text-primary bg-action/10 hover:bg-action/15"
                        >
                          {t("invoices.view")}
                        </Link>
                        {r.status === "DRAFT" && (
                          <>
                            <button
                              type="button"
                              disabled={invoiceActionBusy !== null}
                              className="text-sm px-2 py-1 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10 disabled:opacity-50"
                              onClick={() => void patchStatus(r.id, "SENT")}
                            >
                              {invoiceActionBusy === `${r.id}:SENT` ? "…" : t("invoices.sent")}
                            </button>
                            <button
                              type="button"
                              disabled={invoiceActionBusy !== null}
                              className="text-sm px-2 py-1 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10 disabled:opacity-50"
                              onClick={() => void patchStatus(r.id, "PAID")}
                            >
                              {invoiceActionBusy === `${r.id}:PAID` ? "…" : t("invoices.payFull")}
                            </button>
                          </>
                        )}
                        {(r.status === "SENT" || r.status === "PARTIALLY_PAID") && (
                          <>
                            <button
                              type="button"
                              disabled={invoiceActionBusy !== null}
                              className="text-sm px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                              onClick={() => openPay(r)}
                            >
                              {t("invoices.partialPay")}
                            </button>
                            <button
                              type="button"
                              disabled={invoiceActionBusy !== null}
                              className="text-sm px-2 py-1 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10 disabled:opacity-50"
                              onClick={() => void patchStatus(r.id, "PAID")}
                            >
                              {invoiceActionBusy === `${r.id}:PAID` ? "…" : t("invoices.payFull")}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={invoiceActionBusy !== null}
                          className="text-sm px-2 py-1 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10 disabled:opacity-50"
                          onClick={() => void sendEmail(r.id)}
                        >
                          {invoiceActionBusy === `email:${r.id}` ? "…" : t("invoices.sendEmail")}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {payForId === r.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={8} className="p-4">
                        <div className="flex flex-wrap items-end gap-3 max-w-xl">
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            {t("invoices.payAmount")}
                            <input
                              type="text"
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-36"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                            {t("invoices.payDate")}
                            <input
                              type="date"
                              value={payDate}
                              onChange={(e) => setPayDate(e.target.value)}
                              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={paySubmitting}
                            onClick={() => void submitPartialPayment(r.id)}
                            className={`${PRIMARY_BUTTON_CLASS} px-3 text-sm`}
                          >
                            {paySubmitting ? "…" : t("invoices.paySubmit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPayForId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
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
    </div>
  );
}
