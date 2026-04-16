"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";
import { EmptyState } from "../../../../components/empty-state";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../../lib/design-system";
import { FORM_INPUT_CLASS } from "../../../../lib/form-styles";

type WarehouseRow = { id: string; name: string; inventoryAccountCode?: string };

type AuditLine = {
  id: string;
  productId: string;
  systemQty: unknown;
  factQty: unknown;
  costPrice: unknown;
  product: { id: string; name: string; sku: string };
};

type AuditDetail = {
  id: string;
  date: string;
  status: "DRAFT" | "APPROVED";
  warehouseId: string;
  warehouse: { id: string; name: string; inventoryAccountCode: string };
  lines: AuditLine[];
};

function numStr(v: unknown): string {
  if (v == null) return "0";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

function toNum(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function InventoryAuditNewPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const pendingTimers = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/inventory/warehouses");
    if (!res.ok) {
      setError(`${t("inventory.loadErr")}: ${res.status}`);
      setWarehouses([]);
    } else {
      const data = (await res.json()) as WarehouseRow[];
      setWarehouses(data);
      if (data[0] && !warehouseId) setWarehouseId(data[0].id);
    }
    setLoading(false);
  }, [token, t, warehouseId]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  const dateStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  async function createDraft() {
    if (!token || creating || !warehouseId) return;
    setCreating(true);
    setError(null);
    const res = await apiFetch("/api/inventory/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr, status: "DRAFT", warehouseId }),
    });
    setCreating(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setAudit((await res.json()) as AuditDetail);
  }

  async function approveDraft() {
    if (!token || approving || !audit?.id) return;
    setApproving(true);
    setError(null);
    const res = await apiFetch(`/api/inventory/audits/${encodeURIComponent(audit.id)}/approve`, {
      method: "POST",
    });
    setApproving(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const updated = await apiFetch(`/api/inventory/audits/${encodeURIComponent(audit.id)}`);
    if (updated.ok) setAudit((await updated.json()) as AuditDetail);
  }

  function patchLineDebounced(lineId: string, next: { factQty?: string; costPrice?: string }) {
    if (!token) return;
    const ms = 400;
    const existing = pendingTimers.current[lineId];
    if (existing) window.clearTimeout(existing);
    pendingTimers.current[lineId] = window.setTimeout(() => {
      setSavingLineId(lineId);
      void apiFetch(`/api/inventory/audits/lines/${encodeURIComponent(lineId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(next.factQty != null ? { factQty: toNum(next.factQty) } : {}),
          ...(next.costPrice != null ? { costPrice: toNum(next.costPrice) } : {}),
        }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(await res.text());
        })
        .catch(async () => {
          // ignore: server will block in approved/closed period; UI shows error on approve
        })
        .finally(() => setSavingLineId((cur) => (cur === lineId ? null : cur)));
    }, ms);
  }

  const totals = useMemo(() => {
    if (!audit?.lines?.length) return { sumAbs: 0 };
    const sumAbs = audit.lines.reduce((acc, l) => {
      const d = toNum(numStr(l.factQty)) - toNum(numStr(l.systemQty));
      const amt = d * toNum(numStr(l.costPrice));
      return acc + Math.abs(amt);
    }, 0);
    return { sumAbs };
  }, [audit]);

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8 max-w-5xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/inventory", labelKey: "nav.inventory" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("inventory.auditTitle")}</h1>
          <p className="text-sm text-slate-600 mt-1">{t("inventory.auditSubtitle")}</p>
        </div>
        <Link
          href="/inventory"
          className="text-sm text-action hover:text-primary"
        >
          {t("inventory.auditBack")}
        </Link>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-600">{t("common.loading")}</p>}

      {!loading && warehouses.length === 0 && !error && (
        <EmptyState title={t("inventory.auditEmpty")} description={t("inventory.emptyStockHint")} />
      )}

      {!loading && warehouses.length > 0 && !audit && (
        <div className={`${CARD_CONTAINER_CLASS} p-5 space-y-4`}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t("inventory.thWh")}
                <select
                  className={FORM_INPUT_CLASS}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t("inventory.auditThDateDoc")}
                <input type="date" className={FORM_INPUT_CLASS} value={dateStr} readOnly />
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              disabled={creating}
              onClick={() => void createDraft()}
              className={PRIMARY_BUTTON_CLASS}
            >
              {creating ? "…" : t("inventory.auditSaveDraft")}
            </button>
          </div>
        </div>
      )}

      {audit && (
        <>
          <section className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-x-auto">
            <table className="text-sm min-w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left p-2">{t("inventory.thProduct")}</th>
                  <th className="text-left p-2">{t("inventory.thSku")}</th>
                  <th className="text-right p-2">{t("inventory.auditThSystem")}</th>
                  <th className="text-right p-2">{t("inventory.auditThFact")}</th>
                  <th className="text-right p-2">{t("inventory.auditThDiff")}</th>
                  <th className="text-right p-2">{t("inventory.auditThCost")}</th>
                  <th className="text-right p-2">{t("inventory.auditThAmountDiff")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.lines.map((l) => {
                  const system = toNum(numStr(l.systemQty));
                  const fact = toNum(numStr(l.factQty));
                  const diff = fact - system;
                  const cost = toNum(numStr(l.costPrice));
                  const amt = diff * cost;
                  const disabled = audit.status !== "DRAFT";
                  return (
                    <tr key={l.id} className="border-t border-slate-50">
                      <td className="p-2">{l.product?.name ?? l.productId}</td>
                      <td className="p-2 font-mono text-xs">{l.product?.sku ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums text-slate-600">{numStr(l.systemQty)}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                          value={numStr(l.factQty)}
                          disabled={disabled}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAudit((cur) =>
                              !cur
                                ? cur
                                : {
                                    ...cur,
                                    lines: cur.lines.map((x) => (x.id === l.id ? { ...x, factQty: v } : x)),
                                  },
                            );
                            patchLineDebounced(l.id, { factQty: v });
                          }}
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums">{diff.toFixed(2)}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-28 rounded border border-slate-200 px-2 py-1 text-right"
                          value={numStr(l.costPrice)}
                          disabled={disabled}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAudit((cur) =>
                              !cur
                                ? cur
                                : {
                                    ...cur,
                                    lines: cur.lines.map((x) => (x.id === l.id ? { ...x, costPrice: v } : x)),
                                  },
                            );
                            patchLineDebounced(l.id, { costPrice: v });
                          }}
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {amt.toFixed(2)}
                        {savingLineId === l.id ? <span className="ml-2 text-xs text-slate-400">…</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 m-0">
              {t("inventory.auditTotalDiff")}:{" "}
              <span className="font-semibold tabular-nums">{totals.sumAbs.toFixed(2)}</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={approving || audit.status !== "DRAFT"}
                onClick={() => void approveDraft()}
                className={PRIMARY_BUTTON_CLASS}
              >
                {approving ? "…" : t("inventory.auditApprove")}
              </button>
              <Link href="/inventory/audits" className={SECONDARY_BUTTON_CLASS}>
                {t("inventory.auditHistoryBack")}
              </Link>
            </div>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">{t("inventory.auditApproveHint")}</p>
        </>
      )}
    </div>
  );
}
