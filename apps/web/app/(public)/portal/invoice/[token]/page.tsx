"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type PaymentStatus = "PAID" | "UNPAID";

type PublicPayload = {
  localeHint: "az" | "ru" | "en" | null;
  organization: {
    name: string;
    taxId: string;
    logoUrl: string | null;
    legalAddress: string | null;
    bankAccounts: Array<{
      bankName: string;
      accountNumber: string;
      currency: string;
      iban: string | null;
      swift: string | null;
    }>;
  };
  counterparty: { name: string; taxId: string };
  invoice: {
    number: string;
    status: string;
    dueDate: string;
    totalAmount: string;
    currency: string;
    paidTotal: string;
    remaining: string;
    paymentStatus: PaymentStatus;
    items: Array<{
      description: string | null;
      quantity: string;
      unitPrice: string;
      vatRate: string;
      lineTotal: string;
      productName: string | null;
      sku: string | null;
    }>;
  };
};

const COPY = {
  ru: {
    title: "Счёт",
    load: "Загрузка…",
    notFound: "Ссылка недействительна или счёт удалён.",
    paid: "Оплачено",
    unpaid: "Ожидает оплаты",
    due: "Срок оплаты",
    total: "Итого",
    remaining: "Остаток",
    customer: "Покупатель",
    bank: "Банковские реквизиты",
    lines: "Позиции",
    product: "Товар",
    qty: "Кол-во",
    price: "Цена",
    vat: "НДС %",
    sum: "Сумма",
    downloadPdf: "Скачать PDF",
    voen: "VÖEN",
  },
  az: {
    title: "Hesab",
    load: "Yüklənir…",
    notFound: "Link etibarsızdır və ya hesab silinib.",
    paid: "Ödənilib",
    unpaid: "Ödəniş gözlənilir",
    due: "Ödəniş müddəti",
    total: "Cəmi",
    remaining: "Qalıq",
    customer: "Alıcı",
    bank: "Bank rekvizitləri",
    lines: "Sətirlər",
    product: "Məhsul / xidmət",
    qty: "Miqdar",
    price: "Qiymət",
    vat: "ƏDV %",
    sum: "Məbləğ",
    downloadPdf: "PDF yüklə",
    voen: "VÖEN",
  },
  en: {
    title: "Invoice",
    load: "Loading…",
    notFound: "This link is invalid or the invoice was removed.",
    paid: "Paid",
    unpaid: "Awaiting payment",
    due: "Due date",
    total: "Total",
    remaining: "Balance due",
    customer: "Customer",
    bank: "Bank details",
    lines: "Line items",
    product: "Item",
    qty: "Qty",
    price: "Price",
    vat: "VAT %",
    sum: "Amount",
    downloadPdf: "Download PDF",
    voen: "Tax ID",
  },
} as const;

function resolveLang(hint: string | null | undefined): keyof typeof COPY {
  const h = hint?.trim().toLowerCase();
  if (h === "az" || h === "ru" || h === "en") return h;
  if (typeof navigator !== "undefined") {
    for (const raw of navigator.languages ?? []) {
      const l = raw.split("-")[0]?.toLowerCase();
      if (l === "az" || l === "ru") return l;
      if (l === "en") return "en";
    }
  }
  return "az";
}

function formatMoney(n: string, cur: string) {
  const x = Number(n);
  if (Number.isNaN(x)) return `${n} ${cur}`;
  return `${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${cur}`;
}

export default function PublicInvoicePortalPage() {
  const params = useParams();
  const raw = params.token;
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const [data, setData] = useState<PublicPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const lang = useMemo(
    () => resolveLang(data?.localeHint ?? null),
    [data?.localeHint],
  );
  const t = COPY[lang];

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setErr("missing token");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(
          `/api/public/invoices/${encodeURIComponent(token)}`,
          { credentials: "omit" },
        );
        if (!res.ok) {
          if (!cancelled) setErr(COPY.en.notFound);
          setData(null);
        } else {
          const j = (await res.json()) as PublicPayload;
          if (!cancelled) setData(j);
        }
      } catch {
        if (!cancelled) setErr(COPY.en.notFound);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const pdfHref = token
    ? `/api/public/invoices/${encodeURIComponent(token)}/pdf`
    : "#";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
        {loading && (
          <p className="text-center text-slate-600 text-sm">{t.load}</p>
        )}
        {err && !loading && (
          <p className="text-center text-red-600 text-sm px-2">{err}</p>
        )}
        {!loading && data && (
          <div className="space-y-6">
            <header className="flex flex-col items-center gap-3 text-center">
              {data.organization.logoUrl ? (
                <img
                  src={data.organization.logoUrl}
                  alt=""
                  className="max-h-14 max-w-[200px] object-contain"
                />
              ) : (
                <div className="text-lg font-semibold text-slate-800">
                  {data.organization.name}
                </div>
              )}
              <div
                className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${
                  data.invoice.paymentStatus === "PAID"
                    ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
                    : "bg-amber-100 text-amber-950 ring-1 ring-amber-200"
                }`}
              >
                {data.invoice.paymentStatus === "PAID" ? t.paid : t.unpaid}
              </div>
            </header>

            <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">
                    {t.title} {data.invoice.number}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.organization.name} · {t.voen}{" "}
                    {data.organization.taxId}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div>
                    <span className="text-slate-500">{t.due}: </span>
                    <span className="font-medium">
                      {String(data.invoice.dueDate).slice(0, 10)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-slate-500">{t.total}: </span>
                    <span className="font-semibold">
                      {formatMoney(data.invoice.totalAmount, data.invoice.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">{t.remaining}: </span>
                    <span className="font-medium">
                      {formatMoney(data.invoice.remaining, data.invoice.currency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-sm space-y-1">
                <p className="font-medium text-slate-700">{t.customer}</p>
                <p>{data.counterparty.name}</p>
                <p className="text-slate-500 text-xs">
                  {t.voen} {data.counterparty.taxId}
                </p>
              </div>

              {data.organization.legalAddress ? (
                <p className="text-xs text-slate-500">
                  {data.organization.legalAddress}
                </p>
              ) : null}

              {data.organization.bankAccounts.length > 0 && (
                <div className="text-sm space-y-2 pt-2 border-t border-slate-100">
                  <p className="font-medium text-slate-700">{t.bank}</p>
                  <ul className="space-y-2 text-xs text-slate-600">
                    {data.organization.bankAccounts.map((b, i) => (
                      <li key={i} className="rounded-lg bg-slate-50 p-2">
                        <div className="font-medium text-slate-800">
                          {b.bankName} · {b.currency}
                        </div>
                        <div>{b.accountNumber}</div>
                        {b.iban ? <div>IBAN {b.iban}</div> : null}
                        {b.swift ? <div>SWIFT {b.swift}</div> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100">
                <p className="font-medium text-slate-700 text-sm mb-2">{t.lines}</p>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs min-w-[320px]">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-100">
                        <th className="py-2 pr-2">{t.product}</th>
                        <th className="py-2 pr-2 whitespace-nowrap">{t.qty}</th>
                        <th className="py-2 pr-2 whitespace-nowrap">{t.price}</th>
                        <th className="py-2 pr-2 whitespace-nowrap">{t.vat}</th>
                        <th className="py-2 text-right whitespace-nowrap">{t.sum}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoice.items.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-50 align-top">
                          <td className="py-2 pr-2">
                            {row.productName ?? row.description ?? "—"}
                            {row.sku ? (
                              <span className="block text-slate-400">{row.sku}</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap">{row.quantity}</td>
                          <td className="py-2 pr-2 whitespace-nowrap">
                            {formatMoney(row.unitPrice, data.invoice.currency)}
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap">{row.vatRate}%</td>
                          <td className="py-2 text-right whitespace-nowrap font-medium">
                            {formatMoney(row.lineTotal, data.invoice.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <a
                href={pdfHref}
                className="flex w-full justify-center rounded-xl bg-[#2980B9] text-white font-semibold text-sm py-3.5 hover:bg-[#2471a3] active:scale-[0.99] transition shadow-md"
              >
                {t.downloadPdf}
              </a>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
