"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiBaseUrl, apiFetch } from "../../lib/api-client";
import { LINK_ACCENT_CLASS, PRIMARY_BUTTON_CLASS } from "../../lib/design-system";
import { FORM_INPUT_CLASS } from "../../lib/form-styles";
import type { AuthUser, OrgSummary } from "../../lib/auth-context";
import { useAuth } from "../../lib/auth-context";
import { LanguageSwitcher } from "../language-switcher";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { login, token, ready, user } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
      const res = await apiFetch("/api/auth/register-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(txt || String(res.status));
        return;
      }
      const data = (await res.json()) as {
        accessToken: string;
        user: AuthUser;
        organizations: OrgSummary[];
      };
      login(data.accessToken, data.user, data.organizations ?? []);
      router.replace("/companies");
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
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">
          {t("auth.registerUserTitle")}
        </h1>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.firstName")}
            <input
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.lastName")}
            <input
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.email")}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.password")}
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON_CLASS} w-full`}>
            {t("auth.submitRegister")}
          </button>
        </form>
        <p className="mt-6 text-sm">
          <Link href="/login" className={LINK_ACCENT_CLASS}>
            {t("auth.haveAccount")}
          </Link>
        </p>
        <p className="mt-3 text-sm text-gray-600">
          <Link href="/register-org" className={LINK_ACCENT_CLASS}>
            {t("auth.registerOrgLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
