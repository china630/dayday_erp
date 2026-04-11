"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { EmptyState } from "../../../components/empty-state";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type Item = {
  id: string | null;
  key: string;
  value: string;
  isOverride: boolean;
  updatedAt: string | null;
};

export default function SuperAdminTranslationsPage() {
  const { t } = useTranslation();
  const { token, ready, user } = useAuth();
  const [q, setQ] = useState("");
  const [locale, setLocale] = useState("az");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ locale, take: "5000" });
    if (q.trim()) params.set("q", q.trim());
    const res = await apiFetch(`/api/admin/translations?${params.toString()}`);
    if (!res.ok) {
      toast.error(await res.text());
      setItems([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: Item[] };
    setItems(data.items ?? []);
    setLoading(false);
  }, [token, locale, q]);

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    void load();
  }, [ready, token, user?.isSuperAdmin, load]);

  const onSync = async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const res = await apiFetch("/api/admin/translations/sync", {
        method: "POST",
      });
      if (!res.ok) {
        toast.error(await res.text());
        return;
      }
      toast.success(t("superAdminTranslations.syncOk"));
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (r) =>
        r.key.toLowerCase().includes(s) ||
        r.value.toLowerCase().includes(s),
    );
  }, [items, q]);

  if (!ready) {
    return <p className="text-[#7F8C8D]">{t("common.loading")}</p>;
  }
  if (!token || !user?.isSuperAdmin) {
    return (
      <EmptyState
        title={t("superAdminTranslations.denied")}
        description={t("superAdminTranslations.deniedHint")}
      />
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#34495E]">
            {t("superAdminTranslations.title")}
          </h1>
          <p className="text-[13px] text-[#7F8C8D] mt-1">
            {t("superAdminTranslations.subtitle")}
          </p>
        </div>
        <Link
          href="/super-admin"
          className="text-[13px] text-[#2980B9] hover:underline"
        >
          ← Super-Admin
        </Link>
      </div>

      <div className={`${CARD_CONTAINER_CLASS} p-4 flex flex-wrap gap-3 items-end`}>
        <label className="text-[13px] text-[#34495E]">
          {t("superAdminTranslations.locale")}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="ml-2 rounded-[2px] border border-[#D5DADF] px-2 py-1"
          >
            <option value="az">az</option>
            <option value="ru">ru</option>
            <option value="en">en</option>
          </select>
        </label>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("superAdminTranslations.search")}
          className="min-w-[200px] flex-1 rounded-[2px] border border-[#D5DADF] px-3 py-1.5 text-[13px]"
        />
        <button
          type="button"
          className={PRIMARY_BUTTON_CLASS}
          onClick={() => void load()}
        >
          {t("superAdminTranslations.refresh")}
        </button>
        <button
          type="button"
          className={PRIMARY_BUTTON_CLASS}
          disabled={syncing}
          onClick={() => void onSync()}
        >
          {syncing ? "…" : t("superAdminTranslations.sync")}
        </button>
      </div>

      <div className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
        {loading ? (
          <p className="p-6 text-[#7F8C8D]">{t("common.loading")}</p>
        ) : (
          <table className="min-w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-[#D5DADF] bg-[#F8F9FA] text-left">
                <th className="p-3 font-semibold text-[#34495E]">Key</th>
                <th className="p-3 font-semibold text-[#34495E]">
                  {t("superAdminTranslations.value")}
                </th>
                <th className="p-3 font-semibold text-[#34495E]">
                  {t("superAdminTranslations.source")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r) => (
                <tr key={r.key} className="border-b border-[#EBEDF0]">
                  <td className="p-2 font-mono text-[12px] text-[#34495E]">
                    {r.key}
                  </td>
                  <td className="p-2 text-[#34495E] max-w-md truncate">
                    {r.value}
                  </td>
                  <td className="p-2 text-[12px] text-[#7F8C8D]">
                    {r.isOverride
                      ? t("superAdminTranslations.fromDb")
                      : t("superAdminTranslations.fromBundle")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
