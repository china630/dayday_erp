"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldWideClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";

type Counterparty = { id: string; name: string; taxId: string };
type Product = {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  vatRate: unknown;
  isService?: boolean;
};

export default function NewInvoicePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [debitAccountCode, setDebitAccountCode] = useState<"101" | "221">("101");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [vatRate, setVatRate] = useState<0 | 18>(18);
  const [currency, setCurrency] = useState<"AZN" | "USD" | "EUR">("AZN");
  const [vatInclusive, setVatInclusive] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void apiFetch("/api/counterparties")
      .then((r) => r.json())
      .then((d) => setCounterparties(Array.isArray(d) ? d : []))
      .catch(() => setCounterparties([]));
    void apiFetch("/api/products")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setProducts(list);
        if (list[0]) {
          setProductId(list[0].id);
          setUnitPrice(Number(list[0].price));
          const vr0 = Number(list[0].vatRate);
          setVatRate(vr0 === 0 ? 0 : 18);
        }
      })
      .catch(() => setProducts([]));
  }, [token]);

  useEffect(() => {
    const p = products.find((x) => x.id === productId);
    if (p) {
      setUnitPrice(Number(p.price));
      const vr = Number(p.vatRate);
      setVatRate(vr === 0 ? 0 : 18);
    }
  }, [productId, products]);

  const selectedProduct = products.find((x) => x.id === productId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!token) {
      setMsg(t("invoiceNew.noAuth"));
      return;
    }
    if (!counterpartyId || !productId) {
      setMsg(t("invoiceNew.selectBoth"));
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
        items: [
          {
            productId,
            quantity,
            unitPrice,
            vatRate,
          },
        ],
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const text = await res.text();
      setMsg(`${res.status}: ${text}`);
      return;
    }
    const data = (await res.json()) as { stockWarnings?: string[] };
    if (data.stockWarnings?.length) {
      alert(`${t("invoiceNew.stockWarningsTitle")}:\n${data.stockWarnings.join("\n")}`);
    }
    router.push("/invoices");
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

  const fieldClass = `mt-1 ${inputFieldWideClass.replace("max-w-xl", "max-w-2xl")}`;

  return (
    <div className="space-y-6">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/invoices", labelKey: "nav.invoices" },
          { href: "/counterparties", labelKey: "nav.counterparties" },
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div>
        <Link href="/invoices" className="text-sm text-action hover:text-primary">
          ← {t("invoiceNew.backList")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("invoiceNew.title")}</h1>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 max-w-2xl space-y-5"
      >
        <div>
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
          <p className="mt-2 text-sm text-slate-600">
            <Link href="/counterparties" className="text-action hover:text-primary font-medium">
              {t("invoiceNew.addCounterpartyHint")}
            </Link>
            {" — "}
            {t("invoiceNew.counterpartyWhereHint")}
          </p>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          {t("invoiceNew.dueDate")}
          <input
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={fieldClass}
          />
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
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "AZN" | "USD" | "EUR")}
            className={fieldClass}
          >
            <option value="AZN">AZN</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={vatInclusive}
            onChange={(e) => setVatInclusive(e.target.checked)}
          />
          {t("invoiceNew.vatInclusive")}
        </label>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            {t("invoiceNew.product")}
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={fieldClass}
            >
              {products.length === 0 ? (
                <option value="">{t("invoiceNew.noProductsOption")}</option>
              ) : (
                products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))
              )}
            </select>
          </label>
          <p className="mt-2 text-sm text-slate-600">
            <Link href="/products/new" className="text-action hover:text-primary font-medium">
              {t("invoiceNew.addProductHint")}
            </Link>
            {" — "}
            {t("invoiceNew.productWhereHint")}
          </p>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          {t("invoiceNew.quantity")}
          <input
            type="number"
            min={0.0001}
            step="any"
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {vatInclusive ? t("invoiceNew.priceHintGross") : t("invoiceNew.priceHintNet")}
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("invoiceNew.vatRateLabel")}
          <select
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value) as 0 | 18)}
            className={fieldClass}
          >
            <option value={0}>0%</option>
            <option value={18}>18%</option>
          </select>
        </label>
        {selectedProduct?.isService ? (
          <p className="text-sm text-slate-600 m-0">{t("invoiceNew.serviceNote")}</p>
        ) : null}
        {msg && <p className="text-red-600 text-sm">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover disabled:opacity-50 text-sm font-medium"
        >
          {busy ? t("invoiceNew.creating") : t("invoiceNew.submit")}
        </button>
      </form>
    </div>
  );
}
