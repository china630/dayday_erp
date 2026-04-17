"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AuditDetailConfirmModal } from "../../../../components/inventory/modals";
import { ModulePageLinks } from "../../../../components/module-page-links";
import { apiFetch } from "../../../../lib/api-client";
import { notifyListRefresh } from "../../../../lib/list-refresh-bus";
import { useAuth } from "../../../../lib/auth-context";
import {
  BORDER_MUTED_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../../lib/design-system";
import { isRestrictedUserRole } from "../../../../lib/role-utils";
import { useRequireAuth } from "../../../../lib/use-require-auth";

type AuditLineDetail = {
  id: string;
  productId: string;
  systemQty: unknown;
  factQty: unknown;
  costPrice: unknown;
  product?: { id: string; name: string; sku: string; isService?: boolean } | null;
};

type AuditDetail = {
  id: string;
  date: string;
  status: string;
  warehouseId: string;
  warehouse?: { id: string; name: string; inventoryAccountCode?: string } | null;
  createdAt: string;
  lines?: AuditLineDetail[];
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

export default function InventoryAuditDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const mayPost = !isRestrictedUserRole(user?.role ?? undefined);

  const [row, setRow] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncOpen, setSyncOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const pendingTimers = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!token || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch(`/api/inventory/audits/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setError(await res.text());
      setRow(null);
    } else {
      setRow((await res.json()) as AuditDetail);
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    if (!ready || !token || !id) return;
    void load();
  }, [load, ready, token, id]);

  useEffect(() => {
    return () => {
      Object.values(pendingTimers.current).forEach((tid) => window.clearTimeout(tid));
    };
  }, []);

  const lines = row?.lines ?? [];
  const isDraft = row?.status === "DRAFT";

  const totals = useMemo(() => {
    let sumAbs = 0;
    for (const l of lines) {
      const system = toNum(numStr(l.systemQty));
      const fact = toNum(numStr(l.factQty));
      const diff = fact - system;
      const cost = toNum(numStr(l.costPrice));
      sumAbs += Math.abs(diff * cost);
    }
    return { sumAbs };
  }, [lines]);

  function patchLineDebounced(lineId: string, next: { factQty?: string; costPrice?: string }) {
    if (!token || !isDraft) return;
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
        .catch((e) => {
          toast.error(t("common.saveErr"), { description: String(e) });
        })
        .finally(() => setSavingLineId((cur) => (cur === lineId ? null : cur)));
    }, ms);
  }

  async function runSync() {
    if (!token || !id) return;
    setSyncBusy(true);
    const res = await apiFetch(`/api/inventory/audits/${encodeURIComponent(id)}/sync-system`, {
      method: "POST",
    });
    setSyncBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    setRow((await res.json()) as AuditDetail);
    toast.success(t("common.save"));
    setSyncOpen(false);
  }

  async function handleApprove() {
    if (!token || !id) return;
    setApproveBusy(true);
    const res = await apiFetch(`/api/inventory/audits/${encodeURIComponent(id)}/approve`, {
      method: "POST",
    });
    setApproveBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    setRow((await res.json()) as AuditDetail);
    toast.success(t("inventory.auditOkApproved"));
    notifyListRefresh("inventory-audits");
    setApproveOpen(false);
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
    <div className="max-w-5xl space-y-8">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/inventory", labelKey: "nav.inventory" },
          { href: "/inventory/audits", labelKey: "inventory.auditHistoryTitle" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#34495E]">{t("inventory.auditDetailTitle")}</h1>
          {row && (
            <p className="mt-1 text-sm text-[#7F8C8D]">
              {typeof row.date === "string" ? row.date.slice(0, 10) : "—"} ·{" "}
              {row.warehouse?.name ? `${row.warehouse.name} · ` : null}
              {row.status === "APPROVED"
                ? t("inventory.auditStatusApproved")
                : row.status === "DRAFT"
                  ? t("inventory.auditStatusDraft")
                  : row.status}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mayPost && isDraft && (
            <>
              <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => setSyncOpen(true)}>
                {t("inventory.auditSyncSystem")}
              </button>
              <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setApproveOpen(true)}>
                {t("inventory.auditPostDoc")}
              </button>
            </>
          )}
          <Link href="/inventory/audits" className={`text-[13px] font-medium text-[#2980B9] hover:text-[#34495E] hover:underline`}>
            {t("inventory.auditHistoryBack")}
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p>}

      {!loading && row && lines.length > 0 && (
        <>
          <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS} bg-white shadow-sm`}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className={`border-b ${BORDER_MUTED_CLASS} bg-[#F4F5F7] text-left text-[#34495E]`}>
                  <th className="p-2 font-semibold">{t("inventory.auditThProduct")}</th>
                  <th className="p-2 font-semibold">{t("inventory.thSku")}</th>
                  <th className="p-2 text-right font-semibold">{t("inventory.auditThSystem")}</th>
                  <th className="p-2 text-right font-semibold">{t("inventory.auditThFact")}</th>
                  <th className="p-2 text-right font-semibold">{t("inventory.auditThDiff")}</th>
                  <th className="p-2 text-right font-semibold">{t("inventory.auditThCost")}</th>
                  <th className="p-2 text-right font-semibold">{t("inventory.auditThAmountDiff")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const system = toNum(numStr(l.systemQty));
                  const fact = toNum(numStr(l.factQty));
                  const diff = fact - system;
                  const cost = toNum(numStr(l.costPrice));
                  const amt = diff * cost;
                  return (
                    <tr key={l.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                      <td className="p-2 text-[#34495E]">{l.product?.name ?? l.productId}</td>
                      <td className="p-2 font-mono text-xs text-slate-600">{l.product?.sku ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums text-slate-700">{numStr(l.systemQty)}</td>
                      <td className="p-2 text-right">
                        {isDraft ? (
                          <input
                            type="number"
                            min={0}
                            step="any"
                            className={`w-28 text-right ${INPUT_BORDERED_CLASS}`}
                            value={numStr(l.factQty)}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRow((cur) =>
                                !cur
                                  ? cur
                                  : {
                                      ...cur,
                                      lines: (cur.lines ?? []).map((x) =>
                                        x.id === l.id ? { ...x, factQty: v } : x,
                                      ),
                                    },
                              );
                              patchLineDebounced(l.id, { factQty: v });
                            }}
                          />
                        ) : (
                          <span className="tabular-nums">{numStr(l.factQty)}</span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{diff.toFixed(4)}</td>
                      <td className="p-2 text-right tabular-nums text-slate-700">{numStr(l.costPrice)}</td>
                      <td className="p-2 text-right tabular-nums">
                        {amt.toFixed(2)}
                        {savingLineId === l.id ? <span className="ml-1 text-xs text-slate-400">…</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-600">
            {t("inventory.auditTotalDiff")}:{" "}
            <span className="font-semibold tabular-nums">{totals.sumAbs.toFixed(2)}</span>
          </p>
          {isDraft && (
            <p className="text-xs text-slate-500">{t("inventory.auditApproveHint")}</p>
          )}
        </>
      )}

      {!loading && row && lines.length === 0 && (
        <p className="text-sm text-slate-600">{t("inventory.auditDetailNoLines")}</p>
      )}

      <AuditDetailConfirmModal
        open={syncOpen}
        title={t("inventory.auditSyncSystem")}
        onClose={() => setSyncOpen(false)}
        busy={syncBusy}
        onConfirm={() => void runSync()}
      >
        <p className="m-0">{t("inventory.auditSyncModalBody")}</p>
      </AuditDetailConfirmModal>

      <AuditDetailConfirmModal
        open={approveOpen}
        title={t("inventory.auditPostDoc")}
        onClose={() => setApproveOpen(false)}
        busy={approveBusy}
        onConfirm={() => void handleApprove()}
      >
        <p className="m-0">{t("inventory.auditConfirmApproveBody")}</p>
      </AuditDetailConfirmModal>
    </div>
  );
}
