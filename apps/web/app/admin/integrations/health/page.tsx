"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../../components/empty-state";
import { apiFetch } from "../../../../lib/api-client";
import { useAuth } from "../../../../lib/auth-context";
import { CARD_CONTAINER_CLASS } from "../../../../lib/design-system";

type HealthProviderRow = {
  provider: string;
  lastSync: string | null;
  latencyMs: number | null;
  currentStatus: "Up" | "Down" | "Degraded";
  providerSuccessRate: number;
  cacheHitRate: number | null;
};

export default function IntegrationsHealthPage() {
  const { t } = useTranslation();
  const { ready, token, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<HealthProviderRow[]>([]);

  const isOwner = user?.role === "OWNER";

  useEffect(() => {
    if (!ready || !token || !isOwner) return;
    let cancelled = false;
    setBusy(true);
    setErr(null);
    void (async () => {
      const res = await apiFetch("/api/integrations/health");
      if (cancelled) return;
      if (!res.ok) {
        setErr(`HTTP ${res.status}`);
        setRows([]);
        setBusy(false);
        return;
      }
      const body = (await res.json()) as { providers?: HealthProviderRow[] };
      setRows(body.providers ?? []);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token, isOwner]);

  const ordered = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const rank = (s: HealthProviderRow["currentStatus"]) =>
          s === "Down" ? 0 : s === "Degraded" ? 1 : 2;
        return rank(a.currentStatus) - rank(b.currentStatus);
      }),
    [rows],
  );

  if (!ready) return <div className="text-sm text-[#7F8C8D]">{t("common.loading")}</div>;
  if (!token || !isOwner) {
    return (
      <EmptyState
        title="Owner only"
        description="Integration health dashboard is available only for OWNER role."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#34495E]">Integration Health</h1>
        <p className="text-sm text-[#7F8C8D] mt-1">
          Last Sync, Latency, Provider Status and cache hit-rate for IBAN / Tax.
        </p>
      </div>
      {err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : null}
      <section className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
        <table className="min-w-full text-sm">
          <thead className="bg-[#F8F9FA] text-left text-[#7F8C8D]">
            <tr>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Last Sync</th>
              <th className="px-3 py-2">Latency</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">provider_success_rate</th>
              <th className="px-3 py-2">Cache Hit Rate</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr>
                <td className="px-3 py-3 text-[#7F8C8D]" colSpan={6}>
                  {t("common.loading")}
                </td>
              </tr>
            ) : ordered.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-[#7F8C8D]" colSpan={6}>
                  No provider metrics yet.
                </td>
              </tr>
            ) : (
              ordered.map((row) => (
                <tr key={row.provider} className="border-t border-[#EBEDF0]">
                  <td className="px-3 py-2 font-medium uppercase">{row.provider}</td>
                  <td className="px-3 py-2 text-[#34495E]">
                    {row.lastSync ? new Date(row.lastSync).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-[#34495E]">
                    {row.latencyMs != null ? `${row.latencyMs} ms` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={[
                        "inline-flex rounded-[2px] px-2 py-0.5 text-xs font-semibold",
                        row.currentStatus === "Up"
                          ? "bg-emerald-100 text-emerald-700"
                          : row.currentStatus === "Degraded"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-700",
                      ].join(" ")}
                    >
                      {row.currentStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[#34495E]">
                    {(row.providerSuccessRate * 100).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[#34495E]">
                    {row.cacheHitRate == null ? "—" : `${(row.cacheHitRate * 100).toFixed(2)}%`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

