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

export default function RegisterOrgPage() {
  const { t } = useTranslation();
  const { login, token, ready, user } = useAuth();
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
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
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          taxId,
          adminFirstName: adminFirstName.trim(),
          adminLastName: adminLastName.trim(),
          adminEmail,
          adminPassword,
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
      const orgs = data.organizations ?? [];
      login(data.accessToken, data.user, orgs);
      if (orgs.length === 0) {
        router.replace("/companies");
      } else {
        router.replace(orgs.length > 1 ? "/companies" : "/");
      }
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
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">{t("auth.registerOrgTitle")}</h1>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.orgName")}
            <input
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.taxId")}
            <input
              required
              pattern="[0-9]{10}"
              maxLength={10}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.firstName")}
            <input
              required
              autoComplete="given-name"
              value={adminFirstName}
              onChange={(e) => setAdminFirstName(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.lastName")}
            <input
              required
              autoComplete="family-name"
              value={adminLastName}
              onChange={(e) => setAdminLastName(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.adminEmail")}
            <input
              type="email"
              required
              autoComplete="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("auth.adminPassword")}
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
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
          <Link href="/register" className={LINK_ACCENT_CLASS}>
            {t("auth.registerUserLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
