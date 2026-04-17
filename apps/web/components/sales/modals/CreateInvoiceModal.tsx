"use client";

import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { formatMoneyAzn } from "../../../lib/format-money";
import { inputFieldWideClass } from "../../../lib/form-classes";
import { BORDER_MUTED_CLASS, INPUT_BORDERED_CLASS, SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";
import { useLedger } from "../../../lib/ledger-context";
import { notifyListRefresh } from "../../../lib/list-refresh-bus";
import { uuidV4 } from "../../../lib/uuid";
import { SalesModalFooter, SalesModalShell } from "./modal-shell";

type Counterparty = { id: string; name: string; taxId: string };
type Product = { id: string; name: string; sku: string; price: unknown; vatRate: unknown; isService?: boolean };

type LineRow = {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

function newLine(): LineRow {
  return {
    key: uuidV4(),
    productId: "",
    description: "",
    quantity: "1",
    unitPrice: "0",
  };
}

/** VAT split for one line; unitPrice is per the vatInclusive flag (gross vs net per unit). */
function vatSplitForLine(
  qty: number,
  unitPrice: number,
  vatRatePct: number,
  vatInclusive: boolean,
): { net: number; vat: number; gross: number } {
  const v = vatRatePct / 100;
  if (vatInclusive) {
    const gross = qty * unitPrice;
    const net = v <= 0 ? gross : gross / (1 + v);
    return { net, vat: gross - net, gross };
  }
  const net = qty * unitPrice;
  const vat = net * v;
  return { net, vat, gross: net + vat };
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
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [debitAccountCode, setDebitAccountCode] = useState<"101" | "221">("101");
  const [currency, setCurrency] = useState<"AZN" | "USD" | "EUR">("AZN");
  const [vatInclusive, setVatInclusive] = useState(false);
  const [vatRate, setVatRate] = useState<0 | 18>(18);
  const [isService, setIsService] = useState(false);
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);
  const [busy, setBusy] = useState(false);
  const [netting, setNetting] = useState<NettingPreview | null>(null);

  const fieldClass = `mt-1 ${inputFieldWideClass.replace("max-w-xl", "max-w-2xl")}`;

  const loadRefs = useCallback(async () => {
    const [c, p] = await Promise.all([apiFetch("/api/counterparties"), apiFetch("/api/products")]);
    if (c.ok) {
      const list = (await c.json()) as Counterparty[];
      setCounterparties(Array.isArray(list) ? list : []);
      setCounterpartyId((prev) => prev || list[0]?.id || "");
    } else {
      setCounterparties([]);
    }
    if (p.ok) {
      const list = (await p.json()) as Product[];
      const arr = Array.isArray(list) ? list : [];
      setProducts(arr);
      const first = arr[0];
      if (first) {
        setLines((prev) =>
          prev.length
            ? prev
            : [
                {
                  ...newLine(),
                  productId: first.id,
                  unitPrice: String(Number(first.price) || 0),
                },
              ],
        );
        const vr0 = Number(first.vatRate);
        setVatRate(vr0 === 0 ? 0 : 18);
      }
    } else {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setDueDate(new Date().toISOString().slice(0, 10));
    setDebitAccountCode("101");
    setCurrency("AZN");
    setVatInclusive(false);
    setVatRate(18);
    setIsService(false);
    setLines([newLine()]);
    void loadRefs();
  }, [open, loadRefs]);

  useEffect(() => {
    if (!open) return;
    if (isService) {
      setLines((prev) =>
        prev.map((x) => ({
          ...x,
          productId: "",
        })),
      );
    }
  }, [isService, open]);

  useEffect(() => {
    if (!open) return;
    if (isService) return;
    // when switching back to products, prefill empty product selections
    const first = products[0];
    if (!first) return;
    setLines((prev) =>
      prev.map((x) =>
        x.productId
          ? x
          : {
              ...x,
              productId: first.id,
              unitPrice: x.unitPrice && x.unitPrice !== "0" ? x.unitPrice : String(Number(first.price) || 0),
            },
      ),
    );
  }, [isService, open, products]);

  useEffect(() => {
    if (!open) {
      setNetting(null);
      return;
    }
    if (!ledgerReady || !counterpartyId) {
      setNetting(null);
      return;
    }
    let cancelled = false;
    const h = window.setTimeout(() => {
      void (async () => {
        const res = await apiFetch(
          `/api/reporting/netting/preview?counterpartyId=${encodeURIComponent(counterpartyId)}&ledgerType=${encodeURIComponent(ledgerType)}`,
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
  }, [open, counterpartyId, ledgerType, ledgerReady]);

  const vatTotals = useMemo(() => {
    let net = 0;
    let vat = 0;
    let gross = 0;
    for (const row of lines) {
      const q = Number(String(row.quantity).replace(",", "."));
      const u = Number(String(row.unitPrice).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) continue;
      if (isService) {
        if (!row.description.trim()) continue;
      } else if (!row.productId) continue;
      const s = vatSplitForLine(q, u, vatRate, vatInclusive);
      net += s.net;
      vat += s.vat;
      gross += s.gross;
    }
    return { net, vat, gross };
  }, [lines, vatRate, vatInclusive, isService]);

  const canSubmit = useMemo(() => {
    if (!counterpartyId) return false;
    const parsed = lines
      .map((row) => {
        const q = Number(String(row.quantity).replace(",", "."));
        const u = Number(String(row.unitPrice).replace(",", "."));
        const okNum = Number.isFinite(q) && q > 0 && Number.isFinite(u) && u >= 0;
        if (!okNum) return null;
        if (isService) {
          if (!row.description.trim()) return null;
          return { productId: null, description: row.description.trim(), quantity: q, unitPrice: u };
        }
        if (!row.productId) return null;
        return { productId: row.productId, description: null, quantity: q, unitPrice: u };
      })
      .filter(Boolean);
    return parsed.length > 0;
  }, [counterpartyId, isService, lines]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!counterpartyId) {
      toast.error(t("invoiceNew.selectBoth"));
      return;
    }
    const items = lines
      .map((row) => {
        const q = Number(String(row.quantity).replace(",", "."));
        const u = Number(String(row.unitPrice).replace(",", "."));
        if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) return null;
        if (isService) {
          const desc = row.description.trim();
          if (!desc) return null;
          return { description: desc, quantity: q, unitPrice: u, vatRate };
        }
        if (!row.productId) return null;
        return { productId: row.productId, quantity: q, unitPrice: u, vatRate };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    if (items.length === 0) {
      toast.error(t("invoiceNew.selectBoth"));
      return;
    }

    setBusy(true);
    const res = await apiFetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        counterpartyId,
        dueDate,
        debitAccountCode,
        currency,
        vatInclusive,
        items,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    const data = (await res.json()) as { stockWarnings?: string[] };
    if (!isService && data.stockWarnings?.length) {
      toast.warning(t("invoiceNew.stockWarningsTitle"), {
        description: data.stockWarnings.join("\n"),
      });
    }
    toast.success(t("common.save"));
    notifyListRefresh("invoices");
    onClose();
  }

  return (
    <SalesModalShell
      open={open}
      title={t("invoiceNew.title")}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      footer={<SalesModalFooter onCancel={onClose} busy={busy} formId="create-invoice-form" saveDisabled={!canSubmit} />}
    >
      <form id="create-invoice-form" className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            {t("invoiceNew.counterparty")}
            <select
              required
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              className={fieldClass}
            >
              <option value="">—</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.taxId})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("invoiceNew.dueDate")}
            <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("invoiceNew.debitOnPayment")}
            <select
              value={debitAccountCode}
              onChange={(e) => setDebitAccountCode(e.target.value as "101" | "221")}
              className={fieldClass}
            >
              <option value="101">{t("invoiceNew.cash101")}</option>
              <option value="221">{t("invoiceNew.bank221")}</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("invoiceNew.currency")}
            <select value={currency} onChange={(e) => setCurrency(e.target.value as "AZN" | "USD" | "EUR")} className={fieldClass}>
              <option value="AZN">AZN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
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

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={vatInclusive} onChange={(e) => setVatInclusive(e.target.checked)} />
            {t("invoiceNew.vatInclusive")}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            {t("invoiceNew.vatRateLabel")}
            <select
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value) as 0 | 18)}
              className={`h-8 ${INPUT_BORDERED_CLASS}`}
            >
              <option value={0}>0%</option>
              <option value={18}>18%</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={isService} onChange={(e) => setIsService(e.target.checked)} />
            Xidmət
          </label>
        </div>

        <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white`}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#F4F5F7] text-left text-[#34495E]">
              <tr>
                <th className="px-3 py-2 font-semibold">{isService ? "Xidmət" : t("invoiceNew.product")}</th>
                <th className="w-28 px-3 py-2 text-right font-semibold">{t("invoiceNew.quantity")}</th>
                <th className="w-40 px-3 py-2 text-right font-semibold">
                  {vatInclusive ? t("invoiceNew.priceHintGross") : t("invoiceNew.priceHintNet")}
                </th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((row, idx) => (
                <tr key={row.key} className="border-t border-[#EBEDF0]">
                  <td className="px-3 py-2 align-middle">
                    {isService ? (
                      <input
                        value={row.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                        }}
                        placeholder={t("invoiceNew.serviceNote")}
                        className={inputFieldWideClass}
                      />
                    ) : (
                      <select
                        value={row.productId}
                        onChange={(e) => {
                          const v = e.target.value;
                          const p = products.find((x) => x.id === v);
                          setLines((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    productId: v,
                                    unitPrice: String(Number(p?.price) || 0),
                                  }
                                : x,
                            ),
                          );
                        }}
                        className={inputFieldWideClass}
                      >
                        <option value="">{t("invoiceNew.noProductsOption")}</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle text-right">
                    <input
                      value={row.quantity}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                      }}
                      className={`w-28 text-right ${INPUT_BORDERED_CLASS}`}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle text-right">
                    <input
                      value={row.unitPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: v } : x)));
                      }}
                      className={`w-36 text-right ${INPUT_BORDERED_CLASS}`}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle text-center">
                    <button
                      type="button"
                      title={t("inventory.purchaseRemoveLine")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#D5DADF] text-slate-600 hover:bg-[#F4F5F7]"
                      onClick={() => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className={`flex flex-wrap items-center justify-end gap-x-6 gap-y-2 rounded-[2px] border ${BORDER_MUTED_CLASS} bg-[#F8F9FA] px-4 py-3 text-[13px] text-[#34495E]`}
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

        <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setLines((prev) => [...prev, newLine()])}>
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {t("inventory.purchaseAddLine")}
        </button>
      </form>
    </SalesModalShell>
  );
}

