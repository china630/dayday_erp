"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { inputFieldClass } from "../../../../lib/form-classes";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

export default function EditProductPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [vatRate, setVatRate] = useState("18");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoadErr(null);
    const res = await apiFetch(`/api/products/${id}`);
    if (!res.ok) {
      setLoadErr(`${t("products.loadErr")}: ${res.status}`);
      return;
    }
    const r = (await res.json()) as {
      name: string;
      sku: string;
      price: unknown;
      vatRate: unknown;
    };
    setName(r.name);
    setSku(r.sku);
    setPrice(String(r.price));
    setVatRate(String(r.vatRate));
  }, [id, t, token]);

  useEffect(() => {
    if (!ready || !token || !id) return;
    void load();
  }, [load, ready, token, id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!token || !id) return;
    const p = Number(price);
    const v = Number(vatRate);
    if (!name.trim() || !sku.trim() || Number.isNaN(p) || Number.isNaN(v)) {
      setMsg(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    const res = await apiFetch(`/api/products/${id}`, {
      method: "PATCH",
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
      setMsg(`${t("products.updateErr")}: ${await res.text()}`);
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
        ]}
      />
      <div>
        <Link href="/products" className="text-sm text-action hover:text-primary">
          ← {t("products.backList")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("products.editTitle")}</h1>
      </div>

      {loadErr && <p className="text-red-600 text-sm">{loadErr}</p>}

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
          disabled={busy || !!loadErr}
          className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover disabled:opacity-50 text-sm font-medium"
        >
          {busy ? "…" : t("products.save")}
        </button>
      </form>
    </div>
  );
}
