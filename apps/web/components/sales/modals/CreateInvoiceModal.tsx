"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import {
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_CENTER_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  MODAL_CHECKBOX_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_INPUT_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
} from "../../../lib/design-system";
import type { SupportedCurrency } from "../../../lib/currencies";
import { useLedger } from "../../../lib/ledger-context";
import { notifyListRefresh } from "../../../lib/list-refresh-bus";
import {
  INVOICE_VAT_RATE_VALUES,
  type InvoiceVatRateValue,
  type VatRateFormString,
  formStringToVatRate,
  normalizeProductVatRate,
  vatPercentForMath,
  vatRateToFormString,
} from "../../../lib/vat-line-rates";
import { AsyncCombobox } from "../../ui/async-combobox";
import { Button } from "../../ui/button";
import { CurrencySelect } from "../../ui/currency-select";
import { DatePicker } from "../../ui/date-picker";
import { NumericAmountInput } from "../../ui/numeric-amount-input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../ui/select";
import { SalesModalFooter, SalesModalShell } from "./modal-shell";

type Counterparty = { id: string; name: string; taxId: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  vatRate: unknown;
  isService?: boolean;
};

type InvoiceLineForm = {
  productId: string;
  quantity: string;
  unitPrice: string;
  vatRate: VatRateFormString;
};

type InvoiceFormValues = {
  counterpartyId: string;
  dueDate: string;
  debitAccountCode: "101" | "221";
  currency: SupportedCurrency;
  vatInclusive: boolean;
  lines: InvoiceLineForm[];
};

function blankLine(): InvoiceLineForm {
  return {
    productId: "",
    quantity: "0",
    unitPrice: "0",
    vatRate: "18",
  };
}

function lineVatPercentFromForm(vatRate: VatRateFormString | undefined): number {
  const r = formStringToVatRate(String(vatRate ?? "18")) ?? 18;
  return vatPercentForMath(r);
}

function vatLineSelectLabel(rate: InvoiceVatRateValue, t: (k: string) => string): string {
  if (rate === -1) return t("invoiceNew.vatExemptLine");
  if (rate === 0) return t("products.vatOption0");
  if (rate === 2) return t("products.vatOption2");
  if (rate === 8) return t("products.vatOption8");
  return t("products.vatOption18");
}

function vatSplitForLine(
  qty: number,
  unitPriceNet: number,
  vatRatePct: number,
): { net: number; vat: number; gross: number } {
  const v = vatRatePct / 100;
  const net = qty * unitPriceNet;
  const gross = net * (1 + v);
  return { net, vat: gross - net, gross };
}

type NettingPreview = {
  payable531: string;
  receivable: string;
  suggestedAmount: string;
  canNet: boolean;
};

export function CreateInvoiceModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const [busy, setBusy] = useState(false);
  const [netting, setNetting] = useState<NettingPreview | null>(null);
  const [counterpartyLabel, setCounterpartyLabel] = useState("");
  const [lineProductLabels, setLineProductLabels] = useState<Record<string, string>>({});

  const fieldClass = `mt-1 max-w-2xl ${MODAL_INPUT_CLASS}`;

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<InvoiceFormValues>({
    defaultValues: {
      counterpartyId: "",
      dueDate: new Date().toISOString().slice(0, 10),
      debitAccountCode: "101",
      currency: "AZN",
      vatInclusive: false,
      lines: [blankLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const watchedLines = useWatch({ control, name: "lines" });
  const watchedVatInclusive = useWatch({ control, name: "vatInclusive" });
  const watchedCounterpartyId = useWatch({ control, name: "counterpartyId" });

  const fetchCounterparties = useCallback(async (search: string) => {
    const q = new URLSearchParams();
    q.set("limit", "20");
    const trimmed = search.trim();
    if (trimmed) q.set("search", trimmed);
    const res = await apiFetch(`/api/counterparties?${q}`);
    if (!res.ok) return [];
    const list = (await res.json()) as Counterparty[];
    return Array.isArray(list) ? list : [];
  }, []);

  const fetchProducts = useCallback(async (search: string) => {
    const q = new URLSearchParams();
    q.set("limit", "20");
    const trimmed = search.trim();
    if (trimmed) q.set("search", trimmed);
    const res = await apiFetch(`/api/products?${q}`);
    if (!res.ok) return [];
    const list = (await res.json()) as Product[];
    return Array.isArray(list) ? list : [];
  }, []);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setCounterpartyLabel("");
    setLineProductLabels({});
    reset({
      counterpartyId: "",
      dueDate: new Date().toISOString().slice(0, 10),
      debitAccountCode: "101",
      currency: "AZN",
      vatInclusive: false,
      lines: [blankLine()],
    });
  }, [open, reset]);

  useEffect(() => {
    if (!open) {
      setNetting(null);
      return;
    }
    if (!ledgerReady || !watchedCounterpartyId) {
      setNetting(null);
      return;
    }
    let cancelled = false;
    const h = window.setTimeout(() => {
      void (async () => {
        const res = await apiFetch(
          `/api/reporting/netting/preview?counterpartyId=${encodeURIComponent(watchedCounterpartyId)}&ledgerType=${encodeURIComponent(ledgerType)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setNetting(null);
          return;
        }
        setNetting((await res.json()) as NettingPreview);
      })();
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(h);
    };
  }, [open, watchedCounterpartyId, ledgerType, ledgerReady]);

  const vatTotals = useMemo(() => {
    const lines = watchedLines ?? [];
    const vatInclusive = !!watchedVatInclusive;
    let net = 0;
    let vat = 0;
    let gross = 0;
    for (const row of lines) {
      const q = Number(String(row.quantity).replace(",", "."));
      const u = Number(String(row.unitPrice).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) continue;
      if (!row.productId) continue;
      const vrPct = lineVatPercentFromForm(row.vatRate);
      const mult = 1 + vrPct / 100;
      const unitNet = vatInclusive ? u / mult : u;
      const s = vatSplitForLine(q, unitNet, vrPct);
      net += s.net;
      vat += s.vat;
      gross += s.gross;
    }
    return { net, vat, gross };
  }, [watchedLines, watchedVatInclusive]);

  const onValid = async (data: InvoiceFormValues) => {
    const items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      vatRate: number;
    }> = [];

    for (const row of data.lines) {
      if (!row.productId) continue;
      const q = Number(String(row.quantity).replace(",", "."));
      const u = Number(String(row.unitPrice).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) {
        toast.error(t("invoiceNew.quantityLineRequired"));
        return;
      }
      if (!Number.isFinite(u) || u < 0) {
        toast.error(t("invoiceNew.selectBoth"));
        return;
      }
      const vr = Number(row.vatRate);
      if (![-1, 0, 2, 8, 18].includes(vr)) {
        toast.error(t("invoiceNew.vatLineRequired"));
        return;
      }
      items.push({ productId: row.productId, quantity: q, unitPrice: u, vatRate: vr });
    }

    if (items.length === 0) {
      toast.error(t("invoiceNew.selectBoth"));
      return;
    }

    setBusy(true);
    const res = await apiFetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        counterpartyId: data.counterpartyId,
        dueDate: data.dueDate,
        debitAccountCode: data.debitAccountCode,
        currency: data.currency,
        vatInclusive: data.vatInclusive,
        items,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    const resp = (await res.json()) as { stockWarnings?: string[] };
    if (resp.stockWarnings?.length) {
      toast.warning(t("invoiceNew.stockWarningsTitle"), {
        description: resp.stockWarnings.join("\n"),
      });
    }
    toast.success(t("common.save"));
    notifyListRefresh("invoices");
    onClose();
  };

  function productOptionLabel(p: Product): string {
    if (p.isService) {
      return `${p.name} (Xidmət)`;
    }
    return `${p.name} (${p.sku})`;
  }

  function onProductChange(index: number, rowId: string, productId: string, p: Product | null) {
    setValue(`lines.${index}.productId`, productId);
    setLineProductLabels((prev) => ({
      ...prev,
      [rowId]: p ? productOptionLabel(p) : "",
    }));
    if (p) {
      setValue(`lines.${index}.unitPrice`, String(Number(p.price) || 0));
      setValue(
        `lines.${index}.vatRate`,
        vatRateToFormString(normalizeProductVatRate(Number(p.vatRate))),
      );
    } else {
      setValue(`lines.${index}.unitPrice`, "0");
      setValue(`lines.${index}.vatRate`, "18");
    }
  }

  return (
    <SalesModalShell
      open={open}
      title={t("invoiceNew.title")}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      footer={
        <SalesModalFooter
          onCancel={onClose}
          busy={busy}
          formId="create-invoice-form"
          cancelVariant="ghost"
        />
      }
    >
      <form
        id="create-invoice-form"
        className="space-y-4"
        onSubmit={(e) => void handleSubmit(onValid)(e)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={MODAL_FIELD_LABEL_CLASS}>{t("invoiceNew.counterparty")}</span>
            <Controller
              control={control}
              name="counterpartyId"
              rules={{ required: t("invoiceNew.selectCounterpartyRequired") }}
              render={({ field }) => (
                <AsyncCombobox<Counterparty>
                  value={field.value}
                  onChange={(id, item) => {
                    field.onChange(id);
                    setCounterpartyLabel(item ? `${item.name} (${item.taxId})` : "");
                  }}
                  fetcher={fetchCounterparties}
                  getOptionLabel={(c) => `${c.name} (${c.taxId})`}
                  placeholder={t("invoiceNew.selectCounterpartyPlaceholder")}
                  selectedLabel={counterpartyLabel}
                  className="mt-1 max-w-2xl"
                  aria-invalid={!!errors.counterpartyId}
                />
              )}
            />
            {errors.counterpartyId?.message ? (
              <p className="mt-1 text-[13px] text-red-600">{String(errors.counterpartyId.message)}</p>
            ) : null}
          </label>
          <label className="block">
            <span className={MODAL_FIELD_LABEL_CLASS}>{t("invoiceNew.dueDate")}</span>
            <Controller
              control={control}
              name="dueDate"
              rules={{ required: true }}
              render={({ field }) => (
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  className={fieldClass}
                  required
                  aria-invalid={!!errors.dueDate}
                />
              )}
            />
          </label>
          <label className="block">
            <span className={MODAL_FIELD_LABEL_CLASS}>{t("invoiceNew.debitOnPayment")}</span>
            <Controller
              control={control}
              name="debitAccountCode"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  className={fieldClass}
                >
                  <SelectTrigger className="" />
                  <SelectContent>
                    <SelectItem value="101">{t("invoiceNew.cash101")}</SelectItem>
                    <SelectItem value="221">{t("invoiceNew.bank221")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </label>
          <label className="block">
            <span className={MODAL_FIELD_LABEL_CLASS}>{t("invoiceNew.currency")}</span>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <CurrencySelect
                  value={field.value}
                  onValueChange={field.onChange}
                  className={fieldClass}
                />
              )}
            />
          </label>
        </div>

        {netting?.canNet ? (
          <div className="rounded-[2px] border border-[#2980B9]/35 bg-[#EBEDF0] px-3 py-2.5 text-[13px] text-[#34495E]">
            <p className="m-0 font-semibold">{t("invoiceNew.nettingAvailable")}</p>
            <p className="mb-0 mt-1 text-[12px] leading-snug text-[#7F8C8D]">
              {t("invoiceNew.nettingDetail", {
                pay531: netting.payable531,
                rec: netting.receivable,
                suggested: netting.suggestedAmount,
              })}
            </p>
          </div>
        ) : null}

        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#34495E]">
          <input type="checkbox" className={MODAL_CHECKBOX_CLASS} {...register("vatInclusive")} />
          {t("invoiceNew.vatInclusive")}
        </label>

        <div className="overflow-x-auto rounded-[2px] border border-[#D5DADF] bg-white shadow-sm">
          <table className={`${DATA_TABLE_CLASS} w-full table-fixed normal-case`}>
            <thead>
              <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                <th className={`${DATA_TABLE_TH_LEFT_CLASS} min-w-0`}>
                  {t("invoiceNew.lineNomenclature")}
                </th>
                <th className={`${DATA_TABLE_TH_RIGHT_CLASS} w-[5.25rem] shrink-0`}>
                  {t("invoiceNew.lineVatColumn")}
                </th>
                <th className={`${DATA_TABLE_TH_RIGHT_CLASS} w-20 shrink-0`}>
                  {t("invoiceNew.quantity")}
                </th>
                <th className={`${DATA_TABLE_TH_RIGHT_CLASS} w-28 shrink-0`}>
                  {watchedVatInclusive ? t("invoiceNew.priceHintGross") : t("invoiceNew.priceHintNet")}
                </th>
                <th className={`${DATA_TABLE_TH_CENTER_CLASS} w-10 shrink-0`} />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => {
                const row = (watchedLines ?? [])[idx];
                const vrPct = row ? lineVatPercentFromForm(row.vatRate) : 0;
                const displayPrice = (() => {
                  if (!row) return "";
                  const v = Number(String(row.unitPrice).replace(",", "."));
                  if (!watchedVatInclusive || !Number.isFinite(v)) return row.unitPrice;
                  const mult = 1 + vrPct / 100;
                  const gross = v * mult;
                  return String(Math.round(gross * 10_000) / 10_000);
                })();

                return (
                  <tr key={field.id} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_CLASS} min-w-0 !py-1.5 !px-2`}>
                      <AsyncCombobox<Product>
                        value={row?.productId ?? ""}
                        onChange={(id, item) => onProductChange(idx, field.id, id, item)}
                        fetcher={fetchProducts}
                        getOptionLabel={productOptionLabel}
                        placeholder={t("invoiceNew.selectProductPlaceholder")}
                        selectedLabel={lineProductLabels[field.id] ?? ""}
                        listClassName="min-w-[16rem]"
                        className="min-w-0"
                      />
                    </td>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} w-[5.25rem] shrink-0 !py-1.5 !px-2`}>
                      <Select
                        value={row?.vatRate ?? "18"}
                        onValueChange={(v) =>
                          setValue(`lines.${idx}.vatRate`, v as VatRateFormString)
                        }
                        className={`box-border w-full max-w-full py-1.5 px-2 text-right ${MODAL_INPUT_CLASS}`}
                      >
                        <SelectTrigger className="" />
                        <SelectContent>
                          {INVOICE_VAT_RATE_VALUES.map((rate) => (
                            <SelectItem key={rate} value={String(rate)}>
                              {vatLineSelectLabel(rate, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} w-20 shrink-0 !py-1.5 !px-2`}>
                      <Controller
                        control={control}
                        name={`lines.${idx}.quantity`}
                        render={({ field }) => (
                          <NumericAmountInput
                            value={field.value}
                            onValueChange={field.onChange}
                            decimalScale={4}
                            className="box-border w-full max-w-full py-1.5 px-2"
                          />
                        )}
                      />
                    </td>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} w-28 shrink-0 !py-1.5 !px-2`}>
                      <NumericAmountInput
                        value={displayPrice}
                        onValueChange={(plain) => {
                          const n = Number(String(plain).replace(",", "."));
                          if (!Number.isFinite(n)) {
                            setValue(`lines.${idx}.unitPrice`, plain);
                            return;
                          }
                          const mult = 1 + vrPct / 100;
                          const net = watchedVatInclusive ? n / mult : n;
                          const normalized = String(Math.round(net * 10_000) / 10_000);
                          setValue(`lines.${idx}.unitPrice`, normalized);
                        }}
                        decimalScale={4}
                        className="box-border w-full max-w-full py-1.5 px-2"
                      />
                    </td>
                    <td className={`${DATA_TABLE_TD_CLASS} w-10 shrink-0 text-center !py-1.5 !px-1`}>
                      <button
                        type="button"
                        className={`${TABLE_ROW_ICON_BTN_CLASS} text-[#E74C3C]`}
                        title={t("inventory.purchaseRemoveLine")}
                        onClick={() => remove(idx)}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 rounded-[2px] border border-[#D5DADF] bg-[#F8F9FA] px-4 py-3 text-[13px] text-[#34495E]"
        >
          <span>
            {t("invoiceNew.totalsNet")}:{" "}
            <strong className="tabular-nums">{formatMoneyAzn(vatTotals.net)}</strong>
          </span>
          <span>
            {t("invoiceNew.totalsVat")}:{" "}
            <strong className="tabular-nums">{formatMoneyAzn(vatTotals.vat)}</strong>
          </span>
          <span>
            {t("invoiceNew.totalsGross")}:{" "}
            <strong className="tabular-nums">{formatMoneyAzn(vatTotals.gross)}</strong>
          </span>
        </div>

        <Button type="button" variant="secondary" onClick={() => append(blankLine())}>
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {t("inventory.purchaseAddLine")}
        </Button>
      </form>
    </SalesModalShell>
  );
}
