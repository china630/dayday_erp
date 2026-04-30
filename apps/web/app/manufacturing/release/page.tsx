"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import { SECONDARY_BUTTON_CLASS } from "../../../lib/design-system";
import { SubscriptionPaywall } from "../../../components/subscription-paywall";

type Product = { id: string; name: string; sku: string };
type Warehouse = { id: string; name: string };
type Recipe = {
  id: string;
  finishedProductId: string;
  finishedProduct?: { id: string; name: string };
};

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

function ManufacturingReleaseContent() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [relWh, setRelWh] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [relQty, setRelQty] = useState("1");

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    const [pr, wh] = await Promise.all([
      apiFetch("/api/products"),
      apiFetch("/api/inventory/warehouses"),
    ]);
    const rr = await apiFetch("/api/manufacturing/recipes");
    if (!pr.ok || !wh.ok || !rr.ok) {
      setErr(t("manufacturing.loadErr"));
      return;
    }
    const plist = (await pr.json()) as Product[];
    const wlist = (await wh.json()) as Warehouse[];
    const rlist = (await rr.json()) as Recipe[];
    setProducts(plist);
    setWarehouses(wlist);
    setRecipes(rlist);
    setRecipeId((prev) => prev || rlist[0]?.id || "");
    setRelWh((prev) => prev || wlist[0]?.id || "");
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  async function release(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const res = await apiFetch("/api/manufacturing/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseId: relWh,
        recipeId,
        quantity: Number(relQty),
      }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    alert(JSON.stringify(await res.json(), null, 2));
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
    <div className="space-y-8 w-full max-w-3xl">
      <PageHeader
        title={t("manufacturing.releaseTitle")}
        actions={
          <Link href="/manufacturing" className={SECONDARY_BUTTON_CLASS}>
            ← {t("manufacturing.backHub")}
          </Link>
        }
      />
      {err && <p className="text-red-600 text-sm">{err}</p>}

      {products.length > 0 && warehouses.length > 0 && (
        <div className="md:hidden space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">{t("manufacturing.mobileListWarehouses")}</p>
            <div className="space-y-2">
              {warehouses.map((w) => (
                <div
                  key={w.id}
                  className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm text-sm font-medium text-gray-900"
                >
                  {w.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <section
        id="manufacturing-release"
        className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 space-y-4 scroll-mt-24"
      >
        <form onSubmit={(e) => void release(e)} className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={lbl}>{t("manufacturing.warehouse")}</span>
            <select value={relWh} onChange={(e) => setRelWh(e.target.value)} className={inputFieldClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={lbl}>{t("manufacturing.finished")}</span>
            <select
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              className={inputFieldClass}
            >
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.finishedProduct?.name ??
                    products.find((p) => p.id === r.finishedProductId)?.name ??
                    r.finishedProductId}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={lbl}>{t("manufacturing.qty")}</span>
            <input
              type="number"
              step="0.0001"
              min={0.0001}
              value={relQty}
              onChange={(e) => setRelQty(e.target.value)}
              className={inputFieldClass}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium"
            >
              {t("manufacturing.releaseBtn")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function ManufacturingReleasePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;
  return (
    <SubscriptionPaywall module="manufacturing">
      <ManufacturingReleaseContent />
    </SubscriptionPaywall>
  );
}
