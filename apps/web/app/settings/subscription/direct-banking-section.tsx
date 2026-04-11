"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import type { SubscriptionSnapshot } from "../../../lib/subscription-context";

type DirectView = {
  syncMode: "mock" | "rest";
  pasha: { enabled: boolean; url: string; hasToken: boolean };
  abb: { enabled: boolean; url: string; hasToken: boolean };
  kapital: { enabled: boolean; url: string; hasToken: boolean };
  syncActive: boolean;
  credentialsEncryptionConfigured: boolean;
};

type BankKey = "pasha" | "abb" | "kapital";

const BANK_KEYS: BankKey[] = ["pasha", "abb", "kapital"];

const BANK_LABEL_KEY: Record<BankKey, string> = {
  pasha: "subscriptionSettings.directBanking.bankPasha",
  abb: "subscriptionSettings.directBanking.bankAbb",
  kapital: "subscriptionSettings.directBanking.bankKapital",
};

type BankForm = {
  enabled: boolean;
  url: string;
  token: string;
  clear: boolean;
};

const emptyBankForm = (): BankForm => ({
  enabled: true,
  url: "",
  token: "",
  clear: false,
});

export function DirectBankingSection({
  snapshot,
}: {
  snapshot: SubscriptionSnapshot;
}) {
  const { t } = useTranslation();
  const readOnly = snapshot.readOnly;
  const [view, setView] = useState<DirectView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [syncMode, setSyncMode] = useState<"mock" | "rest">("mock");
  const [banks, setBanks] = useState<Record<BankKey, BankForm>>({
    pasha: emptyBankForm(),
    abb: emptyBankForm(),
    kapital: emptyBankForm(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await apiFetch("/api/banking/direct-settings");
    if (!res.ok) {
      setErr(t("subscriptionSettings.directBanking.loadErr"));
      setView(null);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as DirectView;
    setView(data);
    setSyncMode(data.syncMode);
    setBanks({
      pasha: {
        enabled: data.pasha.enabled,
        url: data.pasha.url,
        token: "",
        clear: false,
      },
      abb: {
        enabled: data.abb.enabled,
        url: data.abb.url,
        token: "",
        clear: false,
      },
      kapital: {
        enabled: data.kapital.enabled,
        url: data.kapital.url,
        token: "",
        clear: false,
      },
    });
    setLoading(false);
  }, [t]);

  useEffect(() => {
    if (!snapshot.modules.bankingPro) return;
    void load();
  }, [snapshot.modules.bankingPro, load]);

  async function save() {
    if (readOnly) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    const body: Record<string, unknown> = { syncMode };
    for (const k of BANK_KEYS) {
      const b = banks[k];
      const o: Record<string, unknown> = {
        enabled: b.enabled,
        url: b.url.trim() || null,
      };
      if (b.clear) o.clearToken = true;
      else if (b.token.trim()) o.token = b.token.trim();
      body[k] = o;
    }

    try {
      const res = await apiFetch("/api/banking/direct-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        setErr(`${t("subscriptionSettings.directBanking.saveErr")}: ${txt}`);
        return;
      }
      setMsg(t("subscriptionSettings.directBanking.saved"));
      await load();
    } finally {
      setSaving(false);
    }
  }

  function setBank<K extends keyof BankForm>(
    key: BankKey,
    field: K,
    value: BankForm[K],
  ) {
    setBanks((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  if (!snapshot.modules.bankingPro) return null;

  return (
    <section id="direct-banking" className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("subscriptionSettings.directBanking.title")}
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            {t("subscriptionSettings.directBanking.subtitle")}
          </p>
        </div>
        <Link
          href="/banking"
          className="text-sm font-medium text-action hover:text-primary"
        >
          {t("subscriptionSettings.directBanking.linkBanking")} →
        </Link>
      </div>

      {view?.syncActive && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
          {t("subscriptionSettings.directBanking.syncActive")}
        </div>
      )}

      {!view?.credentialsEncryptionConfigured && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 m-0">
          {t("subscriptionSettings.directBanking.encryptionWarn")}
        </p>
      )}

      {readOnly && (
        <p className="text-sm text-slate-600 m-0">
          {t("subscriptionSettings.directBanking.disabledReadOnly")}
        </p>
      )}

      {err && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 m-0">
          {err}
        </p>
      )}
      {msg && (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 m-0">
          {msg}
        </p>
      )}

      {loading ? (
        <p className="text-slate-600 text-sm">{t("common.loading")}</p>
      ) : (
        <>
          <fieldset className="space-y-3" disabled={readOnly}>
            <legend className="text-sm font-medium text-slate-800 mb-2">
              {t("subscriptionSettings.directBanking.modeLabel")}
            </legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bankingSyncMode"
                checked={syncMode === "mock"}
                onChange={() => setSyncMode("mock")}
                className="text-action"
              />
              <span className="text-sm text-slate-800">
                {t("subscriptionSettings.directBanking.modeMock")}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="bankingSyncMode"
                checked={syncMode === "rest"}
                onChange={() => setSyncMode("rest")}
                className="text-action"
              />
              <span className="text-sm text-slate-800">
                {t("subscriptionSettings.directBanking.modeRest")}
              </span>
            </label>
          </fieldset>

          {syncMode === "rest" && (
            <div className="space-y-8 border-t border-slate-100 pt-6">
              {BANK_KEYS.map((key) => {
                const b = banks[key];
                const hasToken = view
                  ? key === "pasha"
                    ? view.pasha.hasToken
                    : key === "abb"
                      ? view.abb.hasToken
                      : view.kapital.hasToken
                  : false;
                return (
                  <div key={key} className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 m-0">
                        {t(BANK_LABEL_KEY[key])}
                      </h3>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={b.enabled}
                          onChange={(e) =>
                            setBank(key, "enabled", e.target.checked)
                          }
                          disabled={readOnly}
                        />
                        <span>{t("subscriptionSettings.directBanking.pollEnabled")}</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {t("subscriptionSettings.directBanking.labelUrl")}
                      </label>
                      <input
                        type="url"
                        value={b.url}
                        onChange={(e) => setBank(key, "url", e.target.value)}
                        disabled={readOnly}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="https://"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {t("subscriptionSettings.directBanking.labelToken")}
                      </label>
                      {hasToken && !b.token && (
                        <p className="text-xs text-slate-500 mb-1 m-0">
                          {t("subscriptionSettings.directBanking.tokenSaved")}
                        </p>
                      )}
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={b.token}
                        onChange={(e) => {
                          setBank(key, "token", e.target.value);
                          if (e.target.value) setBank(key, "clear", false);
                        }}
                        disabled={readOnly}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                        placeholder="••••••••"
                      />
                      {hasToken && (
                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={b.clear}
                            onChange={(e) => {
                              setBank(key, "clear", e.target.checked);
                              if (e.target.checked) setBank(key, "token", "");
                            }}
                            disabled={readOnly}
                          />
                          {t("subscriptionSettings.directBanking.clearToken")}
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            disabled={readOnly || saving}
            onClick={() => void save()}
            className="rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-action-hover disabled:opacity-50"
          >
            {saving
              ? t("subscriptionSettings.directBanking.saving")
              : t("subscriptionSettings.directBanking.save")}
          </button>
        </>
      )}
    </section>
  );
}
