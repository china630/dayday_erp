"use client";

import { amountToWords } from "../../lib/amount-to-words";
import { useTranslation } from "react-i18next";

type Lang = "az" | "ru";

export type KO1PrintOrder = {
  orderNumber: string;
  dateIso: string; // YYYY-MM-DD
  organizationName: string;
  organizationTaxId?: string | null;
  fromParty: string;
  purpose: string;
  amount: string; // "125.50"
};

function FieldRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 border-b border-black/80 py-1.5">
      <div className="text-[11px] leading-tight">{label}</div>
      <div className="text-[11px] leading-tight">
        <div className="min-h-[14px]">{value || " "}</div>
        {hint ? <div className="text-[9px] text-black/70 leading-tight">{hint}</div> : null}
      </div>
    </div>
  );
}

function KO1Half({
  title,
  order,
  lang,
  showReceiptLabel,
}: {
  title: string;
  order: KO1PrintOrder;
  lang: Lang;
  showReceiptLabel: boolean;
}) {
  const { t } = useTranslation();
  const amountText = amountToWords(order.amount, lang);
  return (
    <div className="border border-black/90 p-3">
      <div className="text-center">
        <div className="text-[11px] leading-tight">
          {order.organizationName}
          {order.organizationTaxId
            ? `, ${t("print.ko1.orgVoenLabel", { lng: lang })}: ${order.organizationTaxId}`
            : ""}
        </div>
        <div className="mt-2 text-[13px] font-semibold tracking-wide">
          {title}{" "}
          <span className="font-normal">
            № <span className="font-semibold">{order.orderNumber}</span>
          </span>
        </div>
        {showReceiptLabel ? (
          <div className="mt-1 text-[11px] leading-tight">
            {t("print.ko1.receiptTitle", { lng: lang })}
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <div>
            {t("print.ko1.series", { lng: lang })}{" "}
            <span className="inline-block w-10 border-b border-black/80 align-middle" />{" "}
            {t("print.ko1.number", { lng: lang })}{" "}
            <span className="inline-block w-14 border-b border-black/80 align-middle" />
          </div>
          <div>
            <span className="inline-block w-10 border-b border-black/80 align-middle" />{" "}
            <span className="px-1">/</span> {order.dateIso.slice(0, 4)}{" "}
            {t("print.ko1.yearSuffix", { lng: lang })}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <FieldRow
          label={t("print.ko1.fromLabel", { lng: lang })}
          value={order.fromParty}
          hint={t("print.ko1.fromHint", { lng: lang })}
        />
        <div className="mt-2" />
        <FieldRow
          label={t("print.ko1.purposeLabel", { lng: lang })}
          value={order.purpose}
          hint={t("print.ko1.purposeHint", { lng: lang })}
        />
        <div className="mt-2" />
        <FieldRow
          label={t("print.ko1.amountLabel", { lng: lang })}
          value={`${order.amount}`}
          hint={t("print.ko1.amountHint", { lng: lang })}
        />
        <div className="mt-2 border-b border-black/80 pb-2 text-[11px] leading-tight">
          <div className="font-medium">
            {t("print.ko1.amountWordsLabel", { lng: lang })}
          </div>
          <div className="mt-1 min-h-[16px]">{amountText}</div>
        </div>
        <div className="mt-2 text-[11px] leading-tight">
          {t("print.ko1.depositedLine", { lng: lang })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            {t("print.ko1.stamp", { lng: lang })} <span className="inline-block w-10" />
          </div>
          <div className="col-span-2">
            {t("print.ko1.director", { lng: lang })}:{" "}
            <span className="inline-block w-48 border-b border-black/80 align-middle" />
          </div>
          <div />
          <div className="col-span-2">
            {t("print.ko1.chiefAccountant", { lng: lang })}:{" "}
            <span className="inline-block w-48 border-b border-black/80 align-middle" />
          </div>
          <div />
          <div className="col-span-2">
            {t("print.ko1.cashier", { lng: lang })}:{" "}
            <span className="inline-block w-48 border-b border-black/80 align-middle" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * KO-1 (Forma № KO-1) print form.
 * Render this inside a print-only container; use @media print rules in the caller.
 */
export function KO1PrintForm({
  order,
  lang = "az",
}: {
  order: KO1PrintOrder;
  lang?: Lang;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-white text-black">
      <div className="mx-auto w-[210mm] min-h-[297mm] p-[10mm] print:p-0">
        <div className="flex justify-end text-[11px]">
          <span>{t("print.ko1.formNo", { lng: lang })}</span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3">
          <KO1Half
            title={t("print.ko1.orderTitle", { lng: lang })}
            order={order}
            lang={lang}
            showReceiptLabel={false}
          />
          <KO1Half
            title={t("print.ko1.orderTitle", { lng: lang })}
            order={order}
            lang={lang}
            showReceiptLabel
          />
        </div>

        <div className="mt-2 text-right text-[10px]">
          <span>{t("print.ko1.reverseSide", { lng: lang })}</span>
        </div>
      </div>
    </div>
  );
}

