"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { FORM_INPUT_CLASS } from "../../../lib/form-styles";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

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

export function AuditModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [audit, setAudit] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const pendingTimers = useRef<Record<string, number>>({});

  const dateStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const loadWarehouses = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/inventory/warehouses");
    if (!res.ok) {
      setError(`${t("inventory.loadErr")}: ${res.status}`);
      setWarehouses([]);
    } else {
      const data = (await res.json()) as WarehouseRow[];
      setWarehouses(data);
      setWarehouseId((cur) => (cur && data.some((w) => w.id === cur) ? cur : data[0]?.id ?? ""));
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!open || !ready || !token) return;
    setAudit(null);
    setError(null);
    void loadWarehouses();
  }, [open, ready, token, loadWarehouses]);

  useEffect(() => {
    if (!open) return;
    return () => {
      Object.values(pendingTimers.current).forEach((id) => window.clearTimeout(id));
      pendingTimers.current = {};
    };
  }, [open]);

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
      const msg = await res.text();
      setError(msg);
      toast.error(t("common.saveErr"), { description: msg });
      return;
    }
    setAudit((await res.json()) as AuditDetail);
    toast.success(t("common.save"));
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
      const msg = await res.text();
      setError(msg);
      toast.error(t("common.saveErr"), { description: msg });
      return;
    }
    const updated = await apiFetch(`/api/inventory/audits/${encodeURIComponent(audit.id)}`);
    if (updated.ok) setAudit((await updated.json()) as AuditDetail);
    toast.success(t("common.save"));
    onSuccess();
    onClose();
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
        .catch(() => {})
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

  if (!open) return null;

  const footerDraft = (
    <InventoryModalFooter
      onCancel={onClose}
      onSave={() => void createDraft()}
      busy={creating}
      saveDisabled={!warehouseId || loading}
    />
  );

  const footerApprove = (
    <InventoryModalFooter
      onCancel={onClose}
      onSave={() => void approveDraft()}
      busy={approving}
      saveDisabled={audit?.status !== "DRAFT"}
    />
  );

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.auditTitle")}
      subtitle={t("inventory.auditSubtitle")}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      footer={audit ? footerApprove : footerDraft}
    >
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p>}

      {!loading && warehouses.length === 0 && !error && (
        <p className="text-sm text-slate-600">{t("inventory.auditEmpty")}</p>
      )}

      {!loading && warehouses.length > 0 && !audit && (
        <div className="grid gap-3 md:grid-cols-2">
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
          <label className="block text-sm font-medium text-gray-700">
            {t("inventory.auditThDateDoc")}
            <input type="date" className={FORM_INPUT_CLASS} value={dateStr} readOnly />
          </label>
        </div>
      )}

      {audit && (
        <>
          <section className={`overflow-x-auto rounded-[2px] border border-[#D5DADF] bg-white shadow-sm`}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#EBEDF0]">
                  <th className="p-2 text-left">{t("inventory.thProduct")}</th>
                  <th className="p-2 text-left">{t("inventory.thSku")}</th>
                  <th className="p-2 text-right">{t("inventory.auditThSystem")}</th>
                  <th className="p-2 text-right">{t("inventory.auditThFact")}</th>
                  <th className="p-2 text-right">{t("inventory.auditThDiff")}</th>
                  <th className="p-2 text-right">{t("inventory.auditThCost")}</th>
                  <th className="p-2 text-right">{t("inventory.auditThAmountDiff")}</th>
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
                    <tr key={l.id} className="border-t border-[#EBEDF0]">
                      <td className="p-2">{l.product?.name ?? l.productId}</td>
                      <td className="p-2 font-mono text-xs">{l.product?.sku ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums text-slate-600">{numStr(l.systemQty)}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-28 rounded-[2px] border border-[#D5DADF] px-2 py-1 text-right text-[13px] shadow-sm"
                          value={numStr(l.factQty)}
                          disabled={disabled}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAudit((cur) =>
                              !cur
                                ? cur
                                : {
                                    ...cur,
                                    lines: cur.lines.map((x) =>
                                      x.id === l.id ? { ...x, factQty: v } : x,
                                    ),
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
                          className="w-28 rounded-[2px] border border-[#D5DADF] px-2 py-1 text-right text-[13px] shadow-sm"
                          value={numStr(l.costPrice)}
                          disabled={disabled}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAudit((cur) =>
                              !cur
                                ? cur
                                : {
                                    ...cur,
                                    lines: cur.lines.map((x) =>
                                      x.id === l.id ? { ...x, costPrice: v } : x,
                                    ),
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-slate-600">
              {t("inventory.auditTotalDiff")}:{" "}
              <span className="font-semibold tabular-nums">{totals.sumAbs.toFixed(2)}</span>
            </p>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("inventory.auditApproveHint")}</p>
        </>
      )}
    </InventoryModalShell>
  );
}
