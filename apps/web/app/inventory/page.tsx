"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import { formatMoneyAzn } from "../../lib/format-money";
import { useAuth } from "../../lib/auth-context";
import { isRestrictedUserRole } from "../../lib/role-utils";
import { useRequireAuth } from "../../lib/use-require-auth";
import { subscribeListRefresh } from "../../lib/list-refresh-bus";
import { ModulePageLinks } from "../../components/module-page-links";
import { EmptyState } from "../../components/empty-state";
import {
  AdjustmentsModal,
  AuditHistoryModal,
  AuditModal,
  NewWarehouseModal,
  PurchaseModal,
  SurplusModal,
  TransferModal,
  WriteOffModal,
} from "../../components/inventory/modals";
import {
  BORDER_MUTED_CLASS,
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

type Warehouse = { id: string; name: string; location: string };
type WarehouseBin = {
  id: string;
  warehouseId: string;
  code: string;
  barcode?: string | null;
  warehouse?: { id: string; name: string };
};

type StockRow = {
  id: string;
  quantity: unknown;
  averageCost: unknown;
  product: { id: string; name: string; sku: string };
  warehouse: { id: string; name: string };
  bin?: { id: string; code: string } | null;
};

type Movement = {
  id: string;
  type: string;
  reason: string;
  quantity: unknown;
  price: unknown;
  createdAt: string;
  note: string | null;
  product: { name: string };
  warehouse: { name: string };
  bin?: { id: string; code: string } | null;
  invoice: { number: string } | null;
};

type InventoryModalKey =
  | null
  | "newWh"
  | "purchase"
  | "transfer"
  | "adjustments"
  | "surplus"
  | "writeOff"
  | "audit"
  | "auditHistory";

function fmtQty(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

export default function InventoryPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const hideSettings = isRestrictedUserRole(user?.role ?? undefined);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [bins, setBins] = useState<WarehouseBin[]>([]);
  const [settings, setSettings] = useState<{
    allowNegativeStock?: boolean;
    defaultWarehouseId?: string | null;
    defaultWarehouseResolvedId?: string | null;
  } | null>(null);
  const [filterWh, setFilterWh] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [activeModal, setActiveModal] = useState<InventoryModalKey>(null);

  const [allowNeg, setAllowNeg] = useState(false);
  const [defWh, setDefWh] = useState("");
  const [binWh, setBinWh] = useState("");
  const [binCode, setBinCode] = useState("");
  const [binBarcode, setBinBarcode] = useState("");
  const [binSaving, setBinSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = filterWh ? `?warehouseId=${encodeURIComponent(filterWh)}` : "";
      const [w, s, m, cfg, b] = await Promise.all([
        apiFetch("/api/inventory/warehouses"),
        apiFetch(`/api/inventory/stock${q}`),
        apiFetch("/api/inventory/movements?take=100"),
        apiFetch("/api/inventory/settings"),
        apiFetch("/api/inventory/bins"),
      ]);
      if (!w.ok) throw new Error(`warehouses ${w.status}`);
      if (!s.ok) throw new Error(`stock ${s.status}`);
      if (!m.ok) throw new Error(`movements ${m.status}`);
      setWarehouses(await w.json());
      setStock(await s.json());
      setMovements(await m.json());
      if (b.ok) {
        const binsData = (await b.json()) as WarehouseBin[];
        setBins(binsData);
      }
      if (cfg.ok) {
        const j = await cfg.json();
        setSettings(j);
        setAllowNeg(!!j.allowNegativeStock);
        setDefWh(
          typeof j.defaultWarehouseId === "string" ? j.defaultWarehouseId : "",
        );
        const fallbackWh =
          (typeof j.defaultWarehouseId === "string" && j.defaultWarehouseId) ||
          (typeof j.defaultWarehouseResolvedId === "string" && j.defaultWarehouseResolvedId) ||
          "";
        if (fallbackWh) setBinWh((v) => v || fallbackWh);
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [filterWh, token]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    if (!ready || !token) return;
    return subscribeListRefresh("inventory-hub", () => void load());
  }, [load, ready, token]);

  async function saveSettings() {
    setSettingsSaving(true);
    try {
      const res = await apiFetch("/api/inventory/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowNegativeStock: allowNeg,
          defaultWarehouseId: defWh.trim() ? defWh.trim() : null,
        }),
      });
      if (!res.ok) {
        toast.error(t("common.saveErr"), { description: await res.text() });
        return;
      }
      toast.success(t("common.save"));
      await load();
    } finally {
      setSettingsSaving(false);
    }
  }

  async function createBin() {
    if (!binWh || !binCode.trim()) {
      toast.error(t("inventory.binNeedFields"));
      return;
    }
    setBinSaving(true);
    const res = await apiFetch("/api/inventory/bins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseId: binWh,
        code: binCode.trim(),
        barcode: binBarcode.trim() || undefined,
      }),
    });
    setBinSaving(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    setBinCode("");
    setBinBarcode("");
    await load();
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
    <div className="space-y-8">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/products", labelKey: "nav.products" },
          { href: "/manufacturing", labelKey: "nav.manufacturing" },
          { href: "/invoices", labelKey: "nav.invoices" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#34495E]">{t("inventory.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => setActiveModal("newWh")}
          >
            + {t("inventory.newWhBtn")}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setActiveModal("purchase")}>
            + {t("inventory.newPurchaseBtn")}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setActiveModal("transfer")}>
            {t("inventory.transferNav")}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setActiveModal("adjustments")}>
            {t("inventory.adjustNav")}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setActiveModal("surplus")}>
            {t("inventory.surplusNav")}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setActiveModal("writeOff")}>
            {t("inventory.writeOffNav")}
          </button>
          <button
            type="button"
            className={`${SECONDARY_BUTTON_CLASS} border-[#2980B9]/40 bg-[#2980B9]/10 text-[#34495E]`}
            onClick={() => setActiveModal("audit")}
          >
            {t("inventory.auditNav")}
          </button>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setActiveModal("auditHistory")}>
            {t("inventory.auditHistoryNav")}
          </button>
          <Link href="/inventory/physical" className={SECONDARY_BUTTON_CLASS}>
            {t("inventory.physicalNav")}
          </Link>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!hideSettings && (
        <section className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
          <h2 className="text-lg font-semibold text-[#34495E]">{t("inventory.settings")}</h2>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allowNeg}
              onChange={(e) => setAllowNeg(e.target.checked)}
              className="rounded border-slate-300 text-action focus:ring-action"
            />
            {t("inventory.allowNeg")}
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-0 max-w-xs flex-1 text-sm font-medium text-gray-700">
              {t("inventory.defaultWhLabel")}
              <select
                value={defWh}
                onChange={(e) => setDefWh(e.target.value)}
                className={`mt-1 block w-full max-w-[16rem] ${INPUT_BORDERED_CLASS}`}
              >
                <option value="">{t("inventory.defaultWhAuto")}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={settingsSaving}
              onClick={() => void saveSettings()}
              className={`${PRIMARY_BUTTON_CLASS} disabled:pointer-events-none disabled:opacity-50`}
            >
              {settingsSaving ? "…" : t("inventory.save")}
            </button>
          </div>
          {settings?.defaultWarehouseResolvedId && (
            <p className="text-xs text-slate-500">
              {t("inventory.defaultWhHint", { id: settings.defaultWarehouseResolvedId })}
            </p>
          )}
        </section>
      )}

      <section className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
        <h2 className="text-lg font-semibold text-[#34495E]">{t("inventory.topologyTitle")}</h2>
        <p className="text-sm text-slate-600 m-0">{t("inventory.topologyHint")}</p>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={binWh}
            onChange={(e) => setBinWh(e.target.value)}
            className={INPUT_BORDERED_CLASS}
          >
            <option value="">{t("inventory.whSelect")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input
            value={binCode}
            onChange={(e) => setBinCode(e.target.value)}
            className={INPUT_BORDERED_CLASS}
            placeholder={t("inventory.binCode")}
          />
          <input
            value={binBarcode}
            onChange={(e) => setBinBarcode(e.target.value)}
            className={INPUT_BORDERED_CLASS}
            placeholder={t("inventory.binBarcode")}
          />
          <button
            type="button"
            onClick={() => void createBin()}
            disabled={binSaving}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {binSaving ? "…" : t("inventory.createBin")}
          </button>
        </div>
        {bins.length > 0 ? (
          <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm`}>
            <table className="text-sm min-w-full">
              <thead>
                <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                  <th className="text-left p-2">{t("inventory.thWh")}</th>
                  <th className="text-left p-2">{t("inventory.binCode")}</th>
                  <th className="text-left p-2">{t("inventory.binBarcode")}</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((b) => (
                  <tr key={b.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                    <td className="p-2">{b.warehouse?.name ?? b.warehouseId}</td>
                    <td className="p-2">{b.code}</td>
                    <td className="p-2">{b.barcode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600 m-0">{t("inventory.binsEmpty")}</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#34495E]">{t("inventory.stock")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium text-gray-700">
            {t("inventory.filterWh")}
            <select
              value={filterWh}
              onChange={(e) => setFilterWh(e.target.value)}
              className={`mt-1 block max-w-md ${INPUT_BORDERED_CLASS}`}
            >
              <option value="">{t("inventory.allWh")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className={`${SECONDARY_BUTTON_CLASS} px-4`}
          >
            {t("inventory.refresh")}
          </button>
        </div>
      </section>

      {loading && <p className="text-gray-600">{t("common.loading")}</p>}
      {!loading && stock.length === 0 && !error && (
        <EmptyState
          icon={
            <Package className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />
          }
          title={t("inventory.emptyStock")}
          description={t("inventory.emptyStockHint")}
          action={
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setActiveModal("purchase")}>
              + {t("inventory.newPurchaseBtn")}
            </button>
          }
        />
      )}
      {!loading && stock.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {stock.map((r) => (
              <div
                key={r.id}
                className={`rounded-[2px] ${BORDER_MUTED_CLASS} border bg-white p-4 shadow-sm text-sm space-y-1`}
              >
                <div className="font-medium text-gray-900">{r.product.name}</div>
                <div className="text-slate-600">
                  {t("inventory.thSku")}: {r.product.sku}
                </div>
                <div>
                  {t("inventory.thWh")}: {r.warehouse.name}
                </div>
                <div>
                  {t("inventory.thQty")}: {fmtQty(r.quantity)}
                </div>
                <div>
                  {t("inventory.thAvgCost")}: {formatMoneyAzn(r.averageCost)}
                </div>
              </div>
            ))}
          </div>
          <div className={`hidden md:block overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm`}>
            <table className="text-sm min-w-full">
              <thead>
                <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                  <th className="text-left p-2">{t("inventory.thWh")}</th>
                  <th className="text-left p-2">{t("inventory.thProduct")}</th>
                  <th className="text-left p-2">{t("inventory.thSku")}</th>
                  <th className="text-left p-2">{t("inventory.thQty")}</th>
                <th className="text-left p-2">{t("inventory.thBin")}</th>
                  <th className="text-right p-2">{t("inventory.thAvgCost")}</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((r) => (
                  <tr key={r.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                    <td className="p-2">{r.warehouse.name}</td>
                    <td className="p-2">{r.product.name}</td>
                    <td className="p-2">{r.product.sku}</td>
                    <td className="p-2">{fmtQty(r.quantity)}</td>
                    <td className="p-2">{r.bin?.code ?? "—"}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(r.averageCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="text-lg font-semibold text-gray-900">{t("inventory.movements")}</h2>
      {!loading && movements.length === 0 && !error && (
        <EmptyState
          icon={
            <Package className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />
          }
          title={t("inventory.emptyMovements")}
          description={t("inventory.emptyMovementsHint")}
        />
      )}
      {!loading && movements.length > 0 && (
        <>
          <div className="md:hidden space-y-3">
            {movements.map((m) => (
              <div
                key={m.id}
                className={`rounded-[2px] ${BORDER_MUTED_CLASS} border bg-white p-4 shadow-sm text-sm space-y-1`}
              >
                <div className="font-medium text-gray-900">{m.product.name}</div>
                <div className="text-xs text-slate-500">{m.createdAt.slice(0, 19)}</div>
                <div>
                  {t("inventory.thWh")}: {m.warehouse.name}
                </div>
                <div>
                  {t("inventory.thMovType")}: {m.type} · {m.reason}
                </div>
                <div>
                  {t("inventory.thQty")}: {fmtQty(m.quantity)}
                </div>
                <div>
                  {t("inventory.thMovPrice")}: {formatMoneyAzn(m.price)}
                </div>
                <div>
                  {t("inventory.thInvoice")}: {m.invoice?.number ?? "—"}
                </div>
              </div>
            ))}
          </div>
          <div className={`hidden md:block overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm`}>
            <table className="text-sm min-w-full">
              <thead>
                <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                  <th className="text-left p-2">{t("inventory.thMovDate")}</th>
                  <th className="text-left p-2">{t("inventory.thWh")}</th>
                  <th className="text-left p-2">{t("inventory.thProduct")}</th>
                  <th className="text-left p-2">{t("inventory.thMovType")}</th>
                  <th className="text-left p-2">{t("inventory.thMovReason")}</th>
                  <th className="text-left p-2">{t("inventory.thQty")}</th>
                  <th className="text-left p-2">{t("inventory.thBin")}</th>
                  <th className="text-right p-2">{t("inventory.thMovPrice")}</th>
                  <th className="text-left p-2">{t("inventory.thInvoice")}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                    <td className="p-2 whitespace-nowrap">{m.createdAt.slice(0, 19)}</td>
                    <td className="p-2">{m.warehouse.name}</td>
                    <td className="p-2">{m.product.name}</td>
                    <td className="p-2">{m.type}</td>
                    <td className="p-2">{m.reason}</td>
                    <td className="p-2">{fmtQty(m.quantity)}</td>
                    <td className="p-2">{m.bin?.code ?? "—"}</td>
                    <td className="p-2 text-right font-mono">{formatMoneyAzn(m.price)}</td>
                    <td className="p-2">{m.invoice?.number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <NewWarehouseModal open={activeModal === "newWh"} onClose={() => setActiveModal(null)} />
      <PurchaseModal open={activeModal === "purchase"} onClose={() => setActiveModal(null)} />
      <TransferModal open={activeModal === "transfer"} onClose={() => setActiveModal(null)} />
      <AdjustmentsModal open={activeModal === "adjustments"} onClose={() => setActiveModal(null)} />
      <SurplusModal open={activeModal === "surplus"} onClose={() => setActiveModal(null)} />
      <WriteOffModal open={activeModal === "writeOff"} onClose={() => setActiveModal(null)} />
      <AuditModal open={activeModal === "audit"} onClose={() => setActiveModal(null)} />
      <AuditHistoryModal open={activeModal === "auditHistory"} onClose={() => setActiveModal(null)} />
    </div>
  );
}
