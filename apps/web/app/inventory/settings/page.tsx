"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { isRestrictedUserRole } from "../../../lib/role-utils";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { subscribeListRefresh } from "../../../lib/list-refresh-bus";
import { PageHeader } from "../../../components/layout/page-header";
import { NewWarehouseModal } from "../../../components/inventory/modals";
import {
  BORDER_MUTED_CLASS,
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type Warehouse = { id: string; name: string; location: string };
type WarehouseBin = {
  id: string;
  warehouseId: string;
  code: string;
  barcode?: string | null;
  warehouse?: { id: string; name: string };
};

export default function InventorySettingsPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const hideSettings = isRestrictedUserRole(user?.role ?? undefined);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [bins, setBins] = useState<WarehouseBin[]>([]);
  const [settings, setSettings] = useState<{
    allowNegativeStock?: boolean;
    defaultWarehouseId?: string | null;
    defaultWarehouseResolvedId?: string | null;
  } | null>(null);
  const [allowNeg, setAllowNeg] = useState(false);
  const [defWh, setDefWh] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [binWh, setBinWh] = useState("");
  const [binCode, setBinCode] = useState("");
  const [binBarcode, setBinBarcode] = useState("");
  const [binSaving, setBinSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newWhOpen, setNewWhOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [w, cfg, b] = await Promise.all([
        apiFetch("/api/inventory/warehouses"),
        apiFetch("/api/inventory/settings"),
        apiFetch("/api/inventory/bins"),
      ]);
      if (!w.ok) throw new Error(`warehouses ${w.status}`);
      setWarehouses(await w.json());
      if (b.ok) {
        setBins((await b.json()) as WarehouseBin[]);
      }
      if (cfg.ok) {
        const j = await cfg.json();
        setSettings(j);
        setAllowNeg(!!j.allowNegativeStock);
        setDefWh(typeof j.defaultWarehouseId === "string" ? j.defaultWarehouseId : "");
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
  }, [token]);

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
      <PageHeader
        title={t("inventory.settings")}
        actions={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setNewWhOpen(true)}>
            + {t("inventory.newWhBtn")}
          </button>
        }
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

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

      <NewWarehouseModal
        open={newWhOpen}
        onClose={() => setNewWhOpen(false)}
      />
    </div>
  );
}
