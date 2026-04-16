"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  LINK_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string; isService?: boolean };

export default function InventorySurplusPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [inventoryAccountCode, setInventoryAccountCode] = useState<"201" | "204">("201");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const [w, p] = await Promise.all([
      apiFetch("/api/inventory/warehouses"),
      apiFetch("/api/products"),
    ]);
    if (w.ok) {
      const list = (await w.json()) as Warehouse[];
      setWarehouses(list);
      setWarehouseId((prev) => prev || list[0]?.id || "");
    }
    if (p.ok) {
      const plist = ((await p.json()) as Product[]).filter((x) => !x.isService);
      setProducts(plist);
      setProductId((prev) => prev || plist[0]?.id || "");
    }
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = Number(quantity);
    const up = Number(unitPrice);
    if (!warehouseId || !productId || !Number.isFinite(q) || q <= 0) {
      alert(t("inventory.adjustNeedFields"));
      return;
    }
    if (!Number.isFinite(up) || up < 0) {
      alert(t("inventory.adjustNeedUnitPrice"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/inventory/documents/surplus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseId,
        productId,
        quantity: q,
        inventoryAccountCode,
        unitPrice: up,
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
    <div className="space-y-6 max-w-2xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/inventory", labelKey: "nav.inventory" },
        ]}
      />
      <div>
        <Link href="/inventory" className={`text-[13px] ${LINK_ACCENT_CLASS}`}>
          ← {t("inventory.backList")}
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-[#34495E]">{t("inventory.surplusDocTitle")}</h1>
        <p className="mt-1 text-[13px] text-[#7F8C8D]">{t("inventory.adjustHint")}</p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
        <label className="block text-sm font-medium text-gray-700">
          {t("inventory.transferFrom")}
          <select
            className={INPUT_BORDERED_CLASS}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("inventory.transferPickProduct")}
          <select
            className={INPUT_BORDERED_CLASS}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("inventory.adjustInvAccount")}
          <select
            className={INPUT_BORDERED_CLASS}
            value={inventoryAccountCode}
            onChange={(e) => setInventoryAccountCode(e.target.value as "201" | "204")}
          >
            <option value="201">{t("inventory.adjustInv201")}</option>
            <option value="204">{t("inventory.adjustInv204")}</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("invoiceNew.quantity")}
          <input
            type="number"
            min={0.0001}
            step="any"
            className={INPUT_BORDERED_CLASS}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("inventory.adjustUnitPrice")}
          <input
            type="number"
            min={0}
            step="0.01"
            className={INPUT_BORDERED_CLASS}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "…" : t("inventory.docSubmitSurplus")}
        </button>
      </form>
    </div>
  );
}
