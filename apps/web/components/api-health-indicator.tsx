"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiBaseUrl } from "../lib/api-client";

type HealthState = "checking" | "ok" | "down";

export function ApiHealthIndicator() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<HealthState>("checking");

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        const r = await fetch(`${apiBaseUrl()}/api/health`, {
          method: "GET",
          cache: "no-store",
        });
        if (!cancelled) setStatus(r.ok ? "ok" : "down");
      } catch {
        if (!cancelled) setStatus("down");
      }
    };
    void ping();
    const id = window.setInterval(ping, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const colorClass =
    status === "ok"
      ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"
      : status === "down"
        ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
        : "bg-slate-300";

  const title =
    status === "ok"
      ? t("common.apiStatusOk")
      : status === "down"
        ? t("common.apiStatusDown")
        : t("common.apiStatusCheck");

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${colorClass}`}
      title={title}
      role="status"
      aria-label={title}
    />
  );
}
