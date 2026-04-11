"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldWideClass, textareaFieldClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type Warehouse = { id: string; name: string };

export default function InventoryPurchasePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [purWh, setPurWh] = useState("");
  const [purLines, setPurLines] = useState("productId,qty,unitPrice\n");
  const [busy, setBusy] = useState(false);

  const loadWh = useCallback(async () => {
    if (!token) return;
    const w = await apiFetch("/api/inventory/warehouses");
    if (!w.ok) return;
    const list = (await w.json()) as Warehouse[];
    setWarehouses(list);
    setPurWh((prev) => prev || list[0]?.id || "");
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadWh();
  }, [loadWh, ready, token]);

  async function submitPurchase(e: FormEvent) {
    e.preventDefault();
    const rows = purLines
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(",").map((x) => x.trim()));
    const lines: { productId: string; quantity: number; unitPrice: number }[] = [];
    for (const r of rows) {
      if (r.length < 3) continue;
      lines.push({
        productId: r[0],
        quantity: Number(r[1]),
        unitPrice: Number(r[2]),
      });
    }
    if (!purWh || lines.length === 0) {
      alert(t("inventory.alertPurchase"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/inventory/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseId: purWh, lines, reference: "WEB" }),
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
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("inventory.purchasePageTitle")}</h1>
        <p className="text-sm text-slate-600 mt-1">{t("inventory.purchaseHint")}</p>
      </div>

      <form
        onSubmit={(e) => void submitPurchase(e)}
        className={`${CARD_CONTAINER_CLASS} p-6 space-y-4 max-w-2xl`}
      >
        <label className="block text-sm font-medium text-gray-700">
          {t("inventory.whSelect")}
          <select value={purWh} onChange={(e) => setPurWh(e.target.value)} className={`mt-1 ${inputFieldWideClass}`}>
            <option value="">{t("inventory.whSelect")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <textarea
          rows={6}
          className={textareaFieldClass}
          value={purLines}
          onChange={(e) => setPurLines(e.target.value)}
        />
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "…" : t("inventory.purchaseBtn")}
        </button>
      </form>
    </div>
  );
}
