"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

export default function NewProductPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [vatRate, setVatRate] = useState("18");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!token) return;
    const p = Number(price);
    const v = Number(vatRate);
    if (!name.trim() || !sku.trim() || Number.isNaN(p) || Number.isNaN(v)) {
      setMsg(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        sku: sku.trim(),
        price: p,
        vatRate: v,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(`${t("products.createErr")}: ${await res.text()}`);
      return;
    }
    router.push("/products");
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/products", labelKey: "nav.products" },
          { href: "/invoices", labelKey: "nav.invoices" },
          { href: "/inventory", labelKey: "nav.inventory" },
        ]}
      />
      <div>
        <Link href="/products" className="text-sm text-action hover:text-primary">
          ← {t("products.backList")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("products.newTitle")}</h1>
      </div>

      <form
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 max-w-lg space-y-4"
      >
        <div>
          <span className={lbl}>{t("products.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("products.sku")}</span>
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("products.price")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputFieldClass}
          />
        </div>
        <div>
          <span className={lbl}>{t("products.vat")}</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            className={inputFieldClass}
          />
        </div>
        {msg && <p className="text-red-600 text-sm">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover disabled:opacity-50 text-sm font-medium"
        >
          {busy ? "…" : t("products.save")}
        </button>
      </form>
    </div>
  );
}
