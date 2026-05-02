"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import { useRequireAuth } from "../../lib/use-require-auth";
import { EmptyState } from "../empty-state";
import {
  CARD_CONTAINER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_INPUT_NUMERIC_CLASS,
} from "../../lib/design-system";
import { Button } from "../ui/button";

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

/**
 * Многошаговый сценарий инвентаризации (черновик → строки → утверждение).
 * Используется в модальном окне на `/inventory/audits` (ранее отдельная страница `/inventory/audit/new`).
 */
export function InventoryAuditCreateFlow({
  onNavigateToHistory,
  onBackToInventory,
}: {
  onNavigateToHistory: () => void;
  onBackToInventory: () => void;
}) {
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
    if (!token || creating) return;
    if (!warehouseId) {
      toast.error(t("inventory.auditSelectWarehouse"));
      return;
    }
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
    if (audit.status !== "DRAFT") {
      toast.error(t("inventory.auditApproveNotDraft"));
      return;
    }
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
          /* ignore */
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
      <div className="text-[13px] text-[#7F8C8D]">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg font-semibold text-[#34495E]">{t("inventory.auditTitle")}</h2>
          <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("inventory.auditSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="!h-auto text-[13px] font-medium text-[#2980B9] hover:bg-transparent"
          onClick={onBackToInventory}
        >
          {t("inventory.auditBack")}
        </Button>
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {loading && <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p>}

      {!loading && warehouses.length === 0 && !error && (
        <EmptyState title={t("inventory.auditEmpty")} description={t("inventory.emptyStockHint")} />
      )}

      {!loading && warehouses.length > 0 && !audit && (
        <div className={`${CARD_CONTAINER_CLASS} space-y-4 p-6`}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("inventory.thWh")}
              <select
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
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
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("inventory.auditThDateDoc")}
              <input type="date" className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`} value={dateStr} readOnly />
            </label>
          </div>
          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="primary" disabled={creating} onClick={() => void createDraft()}>
              {creating ? "…" : t("inventory.auditSaveDraft")}
            </Button>
          </div>
        </div>
      )}

      {audit && (
        <>
          <section className="overflow-x-auto rounded-[2px] border border-[#D5DADF] bg-white shadow-sm">
            <table className="min-w-full border-collapse text-[13px]">
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-[#D5DADF] bg-[#F8FAFC]">
                  <th className="px-4 py-2 text-left text-xs font-bold text-[#475569]">{t("inventory.thProduct")}</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-[#475569]">{t("inventory.thSku")}</th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-[#475569]">
                    {t("inventory.auditThSystem")}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-[#475569]">
                    {t("inventory.auditThFact")}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-[#475569]">
                    {t("inventory.auditThDiff")}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-[#475569]">
                    {t("inventory.auditThCost")}
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-bold text-[#475569]">
                    {t("inventory.auditThAmountDiff")}
                  </th>
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
                    <tr key={l.id} className="border-b border-[#D5DADF] bg-white transition-colors hover:bg-[#F1F5F9]">
                      <td className="px-4 py-2 align-middle text-[#34495E]">{l.product?.name ?? l.productId}</td>
                      <td className="px-4 py-2 align-middle font-mono text-[13px] text-[#7F8C8D]">
                        {l.product?.sku ?? t("common.emptyValue")}
                      </td>
                      <td className="px-4 py-2 align-middle text-right font-mono tabular-nums text-[#7F8C8D]">
                        {numStr(l.systemQty)}
                      </td>
                      <td className="px-4 py-2 align-middle text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={`${MODAL_INPUT_NUMERIC_CLASS} !w-28 max-w-[7rem]`}
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
                      <td className="px-4 py-2 align-middle text-right font-mono tabular-nums text-[#34495E]">
                        {diff.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 align-middle text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={`${MODAL_INPUT_NUMERIC_CLASS} !w-28 max-w-[7rem]`}
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
                      <td className="px-4 py-2 align-middle text-right font-mono tabular-nums text-[#34495E]">
                        {amt.toFixed(2)}
                        {savingLineId === l.id ? (
                          <span className="ml-2 text-xs text-[#7F8C8D]">…</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="space-y-4">
            <p className="m-0 text-[13px] text-[#7F8C8D]">
              {t("inventory.auditTotalDiff")}:{" "}
              <span className="font-semibold tabular-nums text-[#34495E]">{totals.sumAbs.toFixed(2)}</span>
            </p>
            <p className="m-0 max-w-2xl text-[13px] text-[#7F8C8D]">{t("inventory.auditApproveHint")}</p>
          </div>
          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onNavigateToHistory}>
              {t("inventory.auditHistoryBack")}
            </Button>
            <Button type="button" variant="primary" disabled={approving} onClick={() => void approveDraft()}>
              {approving ? "…" : t("inventory.auditApprove")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
