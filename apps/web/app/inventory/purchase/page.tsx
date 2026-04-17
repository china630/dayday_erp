"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldWideClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import { uuidV4 } from "../../../lib/uuid";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string };

type LineRow = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
};

function newLine(): LineRow {
  return {
    key: uuidV4(),
    productId: "",
    quantity: "",
    unitPrice: "",
  };
}

export default function InventoryPurchasePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purWh, setPurWh] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [newLine()]);
  const [busy, setBusy] = useState(false);

  const loadWh = useCallback(async () => {
    if (!token) return;
    const [w, p, cfg] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/products"),
      apiFetch("/api/inventory/settings"),
    ]);
    if (w.ok) {
      const list = (await w.json()) as Warehouse[];
      setWarehouses(list);
      setPurWh((prev) => prev || list[0]?.id || "");
    }
    if (p.ok) {
      setProducts((await p.json()) as Product[]);
    }
    if (cfg.ok) {
      const j = (await cfg.json()) as {
        defaultWarehouseResolvedId?: string | null;
        defaultWarehouseId?: string | null;
      };
      const def =
        j.defaultWarehouseId ?? j.defaultWarehouseResolvedId ?? null;
      if (def) setPurWh((prev) => prev || def);
    }
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadWh();
  }, [loadWh, ready, token]);

  async function submitPurchase(e: FormEvent) {
    e.preventDefault();
    const parsed: { productId: string; quantity: number; unitPrice: number }[] =
      [];
    for (const row of lines) {
      if (!row.productId.trim()) continue;
      const q = Number(String(row.quantity).replace(",", "."));
      const u = Number(String(row.unitPrice).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(u) || u < 0) {
        continue;
      }
      parsed.push({
        productId: row.productId.trim(),
        quantity: q,
        unitPrice: u,
      });
    }
    if (!purWh || parsed.length === 0) {
      alert(t("inventory.alertPurchase"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/inventory/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseId: purWh,
        lines: parsed,
        reference: "WEB",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    router.push("/inventory");
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
          { href: "/inventory", labelKey: "nav.inventory" },
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div>
        <Link href="/inventory" className="text-sm text-action hover:text-primary">
          ← {t("inventory.backList")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">
          {t("inventory.purchasePageTitle")}
        </h1>
        <p className="text-sm text-slate-600 mt-1">{t("inventory.purchaseHint")}</p>
      </div>

      <form
        onSubmit={(e) => void submitPurchase(e)}
        className={`${CARD_CONTAINER_CLASS} p-6 space-y-4 max-w-4xl`}
      >
        <label className="block text-sm font-medium text-gray-700">
          {t("inventory.whSelect")}
          <select
            value={purWh}
            onChange={(e) => setPurWh(e.target.value)}
            className={`mt-1 ${inputFieldWideClass}`}
          >
            <option value="">{t("inventory.whSelect")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <div className="overflow-x-auto rounded-[2px] border border-[#D5DADF]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F4F5F7] text-left text-[#34495E]">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("inventory.purchaseColProduct")}</th>
                <th className="px-3 py-2 font-semibold w-28">{t("inventory.purchaseColQty")}</th>
                <th className="px-3 py-2 font-semibold w-32">{t("inventory.purchaseColPrice")}</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody>
              {lines.map((row, idx) => (
                <tr key={row.key} className="border-t border-[#EBEDF0]">
                  <td className="px-3 py-2 align-middle">
                    <select
                      value={row.productId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, productId: v } : x,
                          ),
                        );
                      }}
                      className={inputFieldWideClass}
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={row.quantity}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, quantity: v } : x,
                          ),
                        );
                      }}
                      className={inputFieldWideClass}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      value={row.unitPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, unitPrice: v } : x,
                          ),
                        );
                      }}
                      className={inputFieldWideClass}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-3 py-2 align-middle text-center">
                    <button
                      type="button"
                      title={t("inventory.purchaseRemoveLine")}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#D5DADF] text-slate-600 hover:bg-[#F4F5F7]"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setLines((prev) => [...prev, newLine()])}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {t("inventory.purchaseAddLine")}
          </button>
        </div>

        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "…" : t("inventory.purchaseBtn")}
        </button>
      </form>
    </div>
  );
}
