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
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; sku: string };

type Line = { productId: string; quantity: string };

export default function InventoryTransferPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1" }]);
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
      setFromId((prev) => prev || list[0]?.id || "");
      setToId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
        return list[1]?.id ?? list[0]?.id ?? "";
      });
    }
    if (p.ok) {
      const plist = (await p.json()) as Product[];
      setProducts(plist);
      setLines((prev) =>
        prev.length && prev[0].productId
          ? prev
          : [{ productId: plist[0]?.id ?? "", quantity: "1" }],
      );
    }
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { productId: products[0]?.id ?? "", quantity: "1" },
    ]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !fromId || !toId) {
      alert(t("inventory.transferNeedWh"));
      return;
    }
    if (fromId === toId) {
      alert(t("inventory.transferSameWh"));
      return;
    }
    const ops: { productId: string; quantity: number }[] = [];
    for (const row of lines) {
      const q = Number(row.quantity);
      if (!row.productId || !Number.isFinite(q) || q <= 0) continue;
      ops.push({ productId: row.productId, quantity: q });
    }
    if (ops.length === 0) {
      alert(t("inventory.transferNeedLines"));
      return;
    }
    setBusy(true);
    try {
      for (const op of ops) {
        const res = await apiFetch("/api/inventory/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromWarehouseId: fromId,
            toWarehouseId: toId,
            productId: op.productId,
            quantity: op.quantity,
          }),
        });
        if (!res.ok) {
          alert(await res.text());
          setBusy(false);
          return;
        }
      }
      router.push("/inventory");
    } finally {
      setBusy(false);
    }
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
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div>
        <Link href="/inventory" className={`text-[13px] ${LINK_ACCENT_CLASS}`}>
          ← {t("inventory.backList")}
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-[#34495E]">{t("inventory.transferTitle")}</h1>
        <p className="mt-1 text-[13px] text-[#7F8C8D]">{t("inventory.transferHint")}</p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className={`${CARD_CONTAINER_CLASS} space-y-4 p-5`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[13px] font-medium text-[#34495E]">
            {t("inventory.transferFrom")}
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px] font-medium text-[#34495E]">
            {t("inventory.transferTo")}
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[#34495E]">{t("inventory.transferLines")}</span>
            <button type="button" onClick={() => addLine()} className={SECONDARY_BUTTON_CLASS}>
              + {t("inventory.transferAddLine")}
            </button>
          </div>
          {lines.map((row, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-end">
              <label className="block min-w-[200px] flex-1 text-[13px] font-medium text-[#34495E]">
                {t("inventory.thProduct")}
                <select
                  value={row.productId}
                  onChange={(e) => updateLine(i, { productId: e.target.value })}
                  className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
                >
                  <option value="">{t("inventory.transferPickProduct")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block w-32 text-[13px] font-medium text-[#34495E]">
                {t("inventory.thQty")}
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  className={`mt-1 block w-full ${INPUT_BORDERED_CLASS}`}
                />
              </label>
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className={`mb-1 ${SECONDARY_BUTTON_CLASS} min-w-8 px-2`}
                  aria-label="Remove row"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? "…" : t("inventory.transferSubmit")}
        </button>
      </form>
    </div>
  );
}
