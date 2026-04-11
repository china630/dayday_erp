"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiBaseUrl, apiFetch } from "../../lib/api-client";
import { FORM_INPUT_CLASS, FORM_TEXTAREA_CLASS } from "../../lib/form-styles";
import type { AuthUser, OrgSummary } from "../../lib/auth-context";
import { useAuth } from "../../lib/auth-context";
import {
  CARD_CONTAINER_CLASS,
  LINK_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { useRequireAuth } from "../../lib/use-require-auth";

export default function CompaniesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { ready, token } = useRequireAuth();
  const {
    user,
    organizations,
    switchOrganization,
    login,
  } = useAuth();

  const [joinTaxId, setJoinTaxId] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joinOk, setJoinOk] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [createTaxId, setCreateTaxId] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  if (!ready || !token) {
    return (
      <div className="text-sm text-gray-500">{t("common.loading")}</div>
    );
  }

  async function openOrg(o: OrgSummary) {
    if (o.id === user?.organizationId) {
      router.push("/");
      return;
    }
    try {
      await switchOrganization(o.id);
      router.push("/");
    } catch {
      setJoinErr(t("companiesPage.switchErr"));
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    setJoinErr(null);
    setJoinOk(false);
    setJoinBusy(true);
    try {
      const res = await apiFetch("/api/auth/join-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxId: joinTaxId.replace(/\D/g, "").slice(0, 10),
          message: joinMessage.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setJoinErr(txt || String(res.status));
        return;
      }
      setJoinOk(true);
      setJoinTaxId("");
      setJoinMessage("");
    } catch {
      setJoinErr(t("auth.apiUnreachable", { url: apiBaseUrl() }));
    } finally {
      setJoinBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    setCreateBusy(true);
    try {
      const res = await apiFetch("/api/auth/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: orgName.trim(),
          taxId: createTaxId.replace(/\D/g, "").slice(0, 10),
          currency: "AZN",
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setCreateErr(txt || String(res.status));
        return;
      }
      const data = (await res.json()) as {
        accessToken: string;
        user: AuthUser;
        organizations: OrgSummary[];
      };
      login(data.accessToken, data.user, data.organizations);
      setShowCreate(false);
      setOrgName("");
      setCreateTaxId("");
      router.push("/");
    } catch {
      setCreateErr(t("auth.apiUnreachable", { url: apiBaseUrl() }));
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {t("companiesPage.title")}
        </h1>
        <p className="text-gray-600 mt-2">{t("companiesPage.subtitle")}</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-gray-900">
            {t("companiesPage.yourCompanies")}
          </h2>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className={`${PRIMARY_BUTTON_CLASS} !h-9 !min-h-9 w-9 shrink-0 p-0 text-lg leading-none`}
            aria-label={t("companiesPage.addCompanyAria")}
          >
            +
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={(e) => void onCreate(e)}
            className={`${CARD_CONTAINER_CLASS} p-4 grid gap-3`}
          >
            <p className="text-sm font-medium text-gray-800">
              {t("companiesPage.createTitle")}
            </p>
            <label className="block text-sm font-medium text-gray-800">
              {t("auth.orgName")}
              <input
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className={FORM_INPUT_CLASS}
                autoComplete="organization"
              />
            </label>
            <label className="block text-sm font-medium text-gray-800">
              {t("auth.taxId")}
              <input
                required
                pattern="\d{10}"
                maxLength={10}
                inputMode="numeric"
                value={createTaxId}
                onChange={(e) =>
                  setCreateTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className={FORM_INPUT_CLASS}
                autoComplete="off"
              />
            </label>
            {createErr && (
              <p className="text-red-600 text-sm">{createErr}</p>
            )}
            <div className="flex gap-2 flex-wrap items-center">
              <button
                type="submit"
                disabled={createBusy}
                className={`${PRIMARY_BUTTON_CLASS} inline-flex items-center justify-center gap-2`}
              >
                {createBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                    <span>{t("companiesPage.creating")}</span>
                  </>
                ) : (
                  t("companiesPage.createSubmit")
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={createBusy}
                className={`${SECONDARY_BUTTON_CLASS} disabled:opacity-50`}
              >
                {t("companiesPage.cancel")}
              </button>
            </div>
          </form>
        )}

        <ul className={`${CARD_CONTAINER_CLASS} divide-y divide-[#D5DADF]`}>
          {organizations.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{o.name}</div>
                <div className="text-xs text-gray-500">
                  VÖEN {o.taxId} · {o.currency} · {o.role}
                  {o.id === user?.organizationId
                    ? ` · ${t("companiesPage.current")}`
                    : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void openOrg(o)}
                className={`${PRIMARY_BUTTON_CLASS} shrink-0`}
              >
                {t("companiesPage.open")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-gray-900">
          {t("companiesPage.joinTitle")}
        </h2>
        <p className="text-sm text-gray-600">{t("companiesPage.joinHint")}</p>
        <form
          onSubmit={(e) => void onJoin(e)}
          className={`${CARD_CONTAINER_CLASS} p-4 grid gap-3 max-w-md`}
        >
          <label className="block text-sm font-medium text-gray-800">
            {t("auth.taxId")}
            <input
              required
              pattern="\d{10}"
              maxLength={10}
              inputMode="numeric"
              value={joinTaxId}
              onChange={(e) =>
                setJoinTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className={FORM_INPUT_CLASS}
            />
          </label>
          <label className="block text-sm font-medium text-gray-800">
            {t("companiesPage.messageOptional")}
            <textarea
              value={joinMessage}
              onChange={(e) => setJoinMessage(e.target.value)}
              rows={2}
              className={FORM_TEXTAREA_CLASS}
            />
          </label>
          {joinErr && <p className="text-red-600 text-sm">{joinErr}</p>}
          {joinOk && (
            <p className="text-green-700 text-sm">{t("companiesPage.joinOk")}</p>
          )}
          <button
            type="submit"
            disabled={joinBusy}
            className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
          >
            {joinBusy ? t("common.loading") : t("companiesPage.joinSubmit")}
          </button>
        </form>
      </section>

      <p className="text-sm">
        <Link href="/" className={LINK_ACCENT_CLASS}>
          {t("companiesPage.backHome")}
        </Link>
      </p>
    </div>
  );
}
