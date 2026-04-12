"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiBaseUrl, apiFetch } from "../../lib/api-client";
import type { AuthUser, OrgSummary } from "../../lib/auth-context";
import { useAuth } from "../../lib/auth-context";
import { LINK_ACCENT_CLASS, PRIMARY_BUTTON_CLASS } from "../../lib/design-system";
import { LanguageSwitcher } from "../language-switcher";

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, token, ready, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !token || !user) return;
    if (!user.organizationId) {
      router.replace("/companies");
      return;
    }
    router.replace("/");
  }, [ready, token, user, router]);

  if (ready && token) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(`${res.status}`);
        return;
      }
      const data = (await res.json()) as {
        accessToken: string;
        user: AuthUser;
        organizations: OrgSummary[];
      };
      const orgs = data.organizations ?? [];
      login(data.accessToken, data.user, orgs);
      const target =
        orgs.length === 0 ? "/companies" : orgs.length > 1 ? "/companies" : "/";
      window.location.assign(target);
    } catch {
      setError(t("auth.apiUnreachable", { url: apiBaseUrl() }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-100 shadow-md p-8">
        <div className="mb-6">
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">{t("auth.loginTitle")}</h1>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.email")}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full mt-1.5"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.password")}
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full mt-1.5"
            />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON_CLASS} w-full`}>
            {t("auth.submitLogin")}
          </button>
        </form>
        {/* Временно: тест Sentry (клиентская ошибка из приложения). Удалить после проверки. */}
        <button
          type="button"
          className="mt-4 w-full rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          onClick={() => {
            throw new Error("REAL PRODUCTION ERROR TEST");
          }}
        >
          Спровоцировать ошибку
        </button>
        <p className="mt-6 text-sm">
          <Link href="/register" className={LINK_ACCENT_CLASS}>
            {t("auth.needAccount")}
          </Link>
        </p>
        <p className="mt-3 rounded-[2px] border border-[#D5DADF] bg-[#EBEDF0] px-3 py-2.5 text-sm text-center">
          <Link href="/register-org" className={LINK_ACCENT_CLASS}>
            {t("auth.registerOrgLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
