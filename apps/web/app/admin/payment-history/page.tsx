"use client";

import Link from "next/link";
import { FileDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../components/empty-state";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import {
  CARD_CONTAINER_CLASS,
  DATA_TABLE_CLASS,
  DATA_TABLE_ACTIONS_TD_CLASS,
  DATA_TABLE_ACTIONS_TH_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_CENTER_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_CENTER_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  LINK_ACCENT_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
} from "../../../lib/design-system";
import { canAccessBilling } from "../../../lib/role-utils";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import { intlLocaleRuAz } from "../../../lib/i18n/ui-lang";

type PlatformInvoiceLine = {
  organizationId: string;
  organizationName: string;
  organizationTaxId: string;
  description: string;
  amount: string;
};

type PlatformInvoiceRow = {
  id: string;
  amount: string;
  status: string;
  date: string;
  pdfUrl: string;
  lines: PlatformInvoiceLine[];
};

function statusBadgeClass(status: string): string {
  const base =
    "inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[12px] font-semibold";
  switch (status) {
    case "PAID":
      return `${base} border-[#A3D9A5] bg-[#E8F5E9] text-[#1B5E20]`;
    case "ISSUED":
      return `${base} border-[#F0D78C] bg-[#FFF9E6] text-[#6D4C00]`;
    case "DRAFT":
      return `${base} border-[#D5DADF] bg-[#F4F5F7] text-[#34495E]`;
    case "OVERDUE":
      return `${base} border-[#EF9A9A] bg-[#FFEBEE] text-[#B71C1C]`;
    case "CANCELLED":
    default:
      return `${base} border-[#D5DADF] bg-[#F4F5F7] text-[#34495E]`;
  }
}

export default function PaymentHistoryPage() {
  const { t, i18n } = useTranslation();
  useRequireAuth();
  const { token, ready, user } = useAuth();
  const [items, setItems] = useState<PlatformInvoiceRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const locale = intlLocaleRuAz(i18n.language);

  const load = useCallback(async () => {
    if (!token) return;
    setLoadErr(null);
    const res = await apiFetch("/api/billing/invoices?page=1&pageSize=100");
    if (!res.ok) {
      setLoadErr(await res.text());
      setItems([]);
      return;
    }
    const data = (await res.json()) as { items: PlatformInvoiceRow[] };
    setItems(data.items);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const invoiceStatusLabel = (s: string) => {
    switch (s) {
      case "PAID":
        return t("paymentHistory.invoiceStatusPAID");
      case "ISSUED":
        return t("paymentHistory.invoiceStatusISSUED");
      case "DRAFT":
        return t("paymentHistory.invoiceStatusDRAFT");
      case "OVERDUE":
        return t("paymentHistory.invoiceStatusOVERDUE");
      case "CANCELLED":
        return t("paymentHistory.invoiceStatusCANCELLED");
      default:
        return s;
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const downloadPdf = async (inv: PlatformInvoiceRow) => {
    setPdfBusyId(inv.id);
    try {
      const res = await apiFetch(inv.pdfUrl);
      if (!res.ok) {
        setLoadErr(await res.text());
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `platform-invoice-${inv.id.slice(0, 8)}.pdf`;
      a.rel = "noopener";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBusyId(null);
    }
  };

  if (!ready) {
    return (
      <div className="text-[#34495E]">
        <p className="text-[13px]">{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  if (!canAccessBilling(user?.role ?? undefined)) {
    return (
      <div
        className={`max-w-3xl ${CARD_CONTAINER_CLASS} p-8 space-y-4 border-[#D5DADF]`}
      >
        <PageHeader
          title={t("subscriptionSettings.ownerOnlyTitle")}
          subtitle={t("subscriptionSettings.ownerOnlyBody")}
          actions={
            <Link href="/" className={LINK_ACCENT_CLASS}>
              {t("common.backHome")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title={t("paymentHistory.title")}
        subtitle={
          <>
            <p className="text-[13px] text-[#7F8C8D]">{t("paymentHistory.subtitle")}</p>
            <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[13px] items-center">
              <Link href="/" className={LINK_ACCENT_CLASS}>
                {t("nav.home")}
              </Link>
              <span className="text-[#D5DADF]">/</span>
              <Link href="/admin/billing" className={LINK_ACCENT_CLASS}>
                {t("nav.settingsSubscription")}
              </Link>
              <span className="text-[#D5DADF]">/</span>
              <span className="text-[#34495E]">{t("paymentHistory.title")}</span>
            </div>
          </>
        }
      />

      {loadErr && (
        <p className="text-[13px] text-[#B71C1C] bg-[#FFEBEE] border border-[#EF9A9A] rounded-[2px] px-3 py-2">
          {t("paymentHistory.loadErr")}: {loadErr}
        </p>
      )}

      <div className={`${CARD_CONTAINER_CLASS} overflow-hidden border-[#D5DADF]`}>
        {items === null ? (
          <div className="p-8 text-[13px] text-[#34495E]">{t("common.loading")}</div>
        ) : items.length === 0 ? (
          <EmptyState
            title={t("paymentHistory.empty")}
            className="!border-0 !shadow-none"
          />
        ) : (
          <div className={DATA_TABLE_VIEWPORT_CLASS}>
            <table className={DATA_TABLE_CLASS}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>
                    {t("paymentHistory.colDate")}
                  </th>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>
                    {t("paymentHistory.colOrganization")}
                  </th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>
                    {t("paymentHistory.colAmount")}
                  </th>
                  <th className={DATA_TABLE_TH_CENTER_CLASS}>
                    {t("paymentHistory.colStatus")}
                  </th>
                  <th className={DATA_TABLE_ACTIONS_TH_CLASS}>
                    {t("paymentHistory.pdf")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} whitespace-nowrap`}>
                      {fmtDate(row.date)}
                    </td>
                    <td className={DATA_TABLE_TD_CLASS}>
                      <div className="font-semibold text-[#34495E]">
                        {row.lines.length === 0
                          ? "—"
                          : row.lines.length === 1
                            ? row.lines[0].organizationName
                            : `${row.lines[0].organizationName} (${t("paymentHistory.moreOrgs", { n: row.lines.length - 1 })})`}
                      </div>
                      {row.lines[0]?.organizationTaxId ? (
                        <div className="mt-0.5 text-[12px] text-[#7F8C8D]">
                          VÖEN {row.lines[0].organizationTaxId}
                          {row.lines.length > 1
                            ? ` · +${row.lines.length - 1}`
                            : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} font-semibold`}>
                      {row.amount} AZN
                    </td>
                    <td className={DATA_TABLE_TD_CENTER_CLASS}>
                      <span className={statusBadgeClass(row.status)}>
                        {invoiceStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className={DATA_TABLE_ACTIONS_TD_CLASS}>
                      <button
                        type="button"
                        className={`${TABLE_ROW_ICON_BTN_CLASS} text-[#2980B9]`}
                        disabled={pdfBusyId === row.id}
                        title={t("paymentHistory.pdf")}
                        aria-label={t("paymentHistory.pdfAria")}
                        onClick={() => void downloadPdf(row)}
                      >
                        <FileDown className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
