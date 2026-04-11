"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldClass, textareaFieldClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import { SubscriptionPaywall } from "../../../components/subscription-paywall";

type Product = { id: string; name: string; sku: string };

function parseRecipeLines(text: string): { componentProductId: string; quantityPerUnit: number }[] {
  const lines: { componentProductId: string; quantityPerUnit: number }[] = [];
  const re =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*[,;\s]+\s*([\d.]+)\s*$/i;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = re.exec(line);
    if (!m) {
      throw new Error(`Bad line: ${line}`);
    }
    const q = Number(m[2]);
    if (!Number.isFinite(q) || q <= 0) throw new Error(`Bad qty: ${line}`);
    lines.push({ componentProductId: m[1], quantityPerUnit: q });
  }
  if (lines.length === 0) throw new Error("No lines");
  return lines;
}

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

function ManufacturingRecipeContent() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [finId, setFinId] = useState("");
  const [linesText, setLinesText] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setErr(null);
    const pr = await apiFetch("/api/products");
    if (!pr.ok) {
      setErr(t("manufacturing.loadErr"));
      return;
    }
    const plist = (await pr.json()) as Product[];
    setProducts(plist);
    setFinId((prev) => prev || plist[0]?.id || "");
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  async function saveRecipe(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !finId) return;
    let lines: { componentProductId: string; quantityPerUnit: number }[];
    try {
      lines = parseRecipeLines(linesText);
    } catch (e) {
      alert(String(e));
      return;
    }
    const res = await apiFetch("/api/manufacturing/recipes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finishedProductId: finId, lines }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    alert("OK");
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
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/manufacturing", labelKey: "nav.manufacturing" },
          { href: "/inventory", labelKey: "nav.inventory" },
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div>
        <Link href="/manufacturing" className="text-sm text-action hover:text-primary">
          ← {t("manufacturing.backHub")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("manufacturing.recipes")}</h1>
      </div>
      {err && <p className="text-red-600 text-sm">{err}</p>}

      {products.length > 0 && (
        <div className="md:hidden space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">{t("manufacturing.mobileListProducts")}</p>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm text-sm"
                >
                  <div className="font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{p.sku}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <section className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 space-y-4">
        <form onSubmit={(e) => void saveRecipe(e)} className="space-y-3">
          <label className="block">
            <span className={lbl}>{t("manufacturing.finished")}</span>
            <select value={finId} onChange={(e) => setFinId(e.target.value)} className={inputFieldClass}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={lbl}>{t("manufacturing.linesJson")}</span>
            <textarea
              value={linesText}
              onChange={(e) => setLinesText(e.target.value)}
              className={textareaFieldClass}
              rows={6}
              placeholder="uuid-component  2.5"
            />
          </label>
          <p className="text-xs text-slate-500">{t("manufacturing.hintRecipe")}</p>
          <button
            type="submit"
            className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium"
          >
            {t("manufacturing.saveRecipe")}
          </button>
        </form>
      </section>
    </div>
  );
}

export default function ManufacturingRecipePage() {
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
      <ManufacturingRecipeContent />
    </SubscriptionPaywall>
  );
}
