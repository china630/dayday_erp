"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { accountDisplayName } from "../../../lib/account-display-name";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { SubscriptionPaywall } from "../../../components/subscription-paywall";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  LINK_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type AccountRow = {
  id: string;
  code: string;
  nameAz: string;
  nameRu: string;
  nameEn: string;
  displayName?: string;
  type: string;
};

type MappingRow = {
  id: string;
  ratio: string;
  nasAccount: {
    id: string;
    code: string;
    nameAz: string;
    nameRu: string;
    nameEn: string;
  };
  ifrsAccount: {
    id: string;
    code: string;
    nameAz: string;
    nameRu: string;
    nameEn: string;
  };
};

function canEditMappings(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function AccountMappingContent() {
  const { t, i18n } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { user } = useAuth();
  const edit = canEditMappings(user?.role ?? undefined);

  const [nas, setNas] = useState<AccountRow[]>([]);
  const [ifrs, setIfrs] = useState<AccountRow[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [nasId, setNasId] = useState("");
  const [ifrsId, setIfrsId] = useState("");
  const [ratio, setRatio] = useState("1");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mirroring, setMirroring] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    const loc = encodeURIComponent(i18n.language || "az");
    const [rNas, rIfrs, rMap] = await Promise.all([
      apiFetch(`/api/accounts?ledgerType=NAS&locale=${loc}`),
      apiFetch(`/api/accounts?ledgerType=IFRS&locale=${loc}`),
      apiFetch("/api/account-mappings"),
    ]);
    if (!rNas.ok || !rIfrs.ok || !rMap.ok) {
      setErr(t("mapping.loadErr"));
      setNas([]);
      setIfrs([]);
      setMappings([]);
    } else {
      setNas((await rNas.json()) as AccountRow[]);
      setIfrs((await rIfrs.json()) as AccountRow[]);
      setMappings((await rMap.json()) as MappingRow[]);
    }
    setLoading(false);
  }, [token, t, i18n.language]);

  useEffect(() => {
    if (!ready || !token) return;
    void refresh();
  }, [ready, token, refresh]);

  async function onMirror() {
    if (!token || !edit) return;
    setMirroring(true);
    setMsg(null);
    setErr(null);
    const res = await apiFetch("/api/accounts/ifrs-mirror", { method: "POST" });
    setMirroring(false);
    if (!res.ok) {
      setErr(`${t("mapping.mirrorErr")}: ${res.status}`);
      return;
    }
    const j = (await res.json()) as { created?: number };
    setMsg(t("mapping.mirrorOk", { n: String(j.created ?? 0) }));
    await refresh();
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !edit || !nasId || !ifrsId) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    const res = await apiFetch("/api/account-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nasAccountId: nasId,
        ifrsAccountId: ifrsId,
        ratio: ratio.trim() || "1",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const text = await res.text();
      setErr(`${t("mapping.createErr")}: ${res.status} ${text}`);
      return;
    }
    setMsg(t("mapping.createOk"));
    setNasId("");
    setIfrsId("");
    setRatio("1");
    await refresh();
  }

  async function onDelete(id: string) {
    if (!token || !edit) return;
    if (!window.confirm(t("mapping.confirmDelete"))) return;
    setErr(null);
    const res = await apiFetch(`/api/account-mappings/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setErr(`${t("mapping.deleteErr")}: ${res.status}`);
      return;
    }
    setMsg(t("mapping.deleteOk"));
    await refresh();
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
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{t("mapping.title")}</h1>
        <p className="text-sm text-slate-600 mt-1">{t("mapping.subtitle")}</p>
        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm items-center">
          <Link href="/" className={LINK_ACCENT_CLASS}>
            {t("nav.home")}
          </Link>
          <span className="text-slate-300">/</span>
          <Link href="/reporting" className={LINK_ACCENT_CLASS}>
            {t("nav.reportingHub")}
          </Link>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      {edit && (
        <div className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
          <h2 className="text-base font-semibold text-gray-900">{t("mapping.ifrsMirrorTitle")}</h2>
          <p className="text-sm text-slate-600">{t("mapping.ifrsMirrorHint")}</p>
          <button
            type="button"
            disabled={mirroring || loading}
            onClick={() => void onMirror()}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {mirroring ? "…" : t("mapping.ifrsMirrorBtn")}
          </button>
        </div>
      )}

      {edit && (
        <form onSubmit={onCreate} className={`${CARD_CONTAINER_CLASS} p-4 space-y-4`}>
          <h2 className="text-base font-semibold text-gray-900">{t("mapping.newMapping")}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-[#34495E]">{t("mapping.nasAccount")}</span>
              <select
                required
                value={nasId}
                onChange={(e) => setNasId(e.target.value)}
                className={`block w-full ${INPUT_BORDERED_CLASS}`}
              >
                <option value="">{t("mapping.select")}</option>
                {nas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} —{" "}
                    {a.displayName ?? accountDisplayName(a, i18n.language)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium text-[#34495E]">{t("mapping.ifrsAccount")}</span>
              <select
                required
                value={ifrsId}
                onChange={(e) => setIfrsId(e.target.value)}
                className={`block w-full ${INPUT_BORDERED_CLASS}`}
              >
                <option value="">{t("mapping.select")}</option>
                {ifrs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} —{" "}
                    {a.displayName ?? accountDisplayName(a, i18n.language)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[13px] max-w-xs">
            <span className="font-medium text-[#34495E]">{t("mapping.ratio")}</span>
            <input
              type="text"
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              className={`block w-full ${INPUT_BORDERED_CLASS}`}
              placeholder="1"
            />
          </label>
          <button
            type="submit"
            disabled={saving || loading}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {saving ? "…" : t("mapping.save")}
          </button>
        </form>
      )}

      {!edit && (
        <p className="text-sm text-slate-600">{t("mapping.readOnlyHint")}</p>
      )}

      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">{t("mapping.listTitle")}</h2>
        {loading && <p className="text-gray-600">{t("common.loading")}</p>}
        {!loading && mappings.length === 0 && (
          <p className="text-sm text-slate-600">{t("mapping.none")}</p>
        )}
        {!loading && mappings.length > 0 && (
          <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
            <table className="text-sm min-w-full">
              <thead>
                <tr>
                  <th className="text-left p-2">{t("mapping.thNas")}</th>
                  <th className="text-left p-2">{t("mapping.thIfrs")}</th>
                  <th className="text-left p-2">{t("mapping.thRatio")}</th>
                  {edit && <th className="text-left p-2">{t("mapping.thActions")}</th>}
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="p-2">
                      {m.nasAccount.code} —{" "}
                      {accountDisplayName(m.nasAccount, i18n.language)}
                    </td>
                    <td className="p-2">
                      {m.ifrsAccount.code} —{" "}
                      {accountDisplayName(m.ifrsAccount, i18n.language)}
                    </td>
                    <td className="p-2 font-mono">{m.ratio}</td>
                    {edit && (
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => void onDelete(m.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          {t("mapping.delete")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccountMappingPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;
  return (
    <SubscriptionPaywall module="ifrsMapping">
      <AccountMappingContent />
    </SubscriptionPaywall>
  );
}
