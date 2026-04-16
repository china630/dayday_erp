"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, Link2Off, Plus, Send, Unlink2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { FORM_INPUT_CLASS } from "../../lib/form-styles";
import type { AuthUser, OrgSummary } from "../../lib/auth-context";
import { useAuth } from "../../lib/auth-context";
import {
  CARD_CONTAINER_CLASS,
  LINK_ACCENT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { useRequireAuth } from "../../lib/use-require-auth";
import { Badge } from "../../components/ui/badge";
import { VoenRequestModal } from "../../components/companies/voen-request-modal";
import { CreateCompanyModal } from "../../components/companies/create-company-modal";
import { CreateHoldingModal } from "../../components/holding/create-holding-modal";

type OrganizationsTree = {
  holdings: Array<{
    holdingId: string;
    holdingName: string;
    baseCurrency: string;
    organizations: Array<{
      id: string;
      name: string;
      taxId: string;
      currency: string;
    }>;
  }>;
  freeOrganizations: Array<{
    id: string;
    name: string;
    taxId: string;
    currency: string;
  }>;
};

type HoldingListItem = {
  id: string;
  name: string;
  baseCurrency?: string | null;
  organizations?: unknown[];
};

export default function CompaniesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { ready, token } = useRequireAuth();
  const { user, organizations, switchOrganization } = useAuth();

  const [voenModalOpen, setVoenModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createHoldingOpen, setCreateHoldingOpen] = useState(false);

  const [tree, setTree] = useState<OrganizationsTree | null>(null);
  const [holdings, setHoldings] = useState<HoldingListItem[]>([]);
  const [holdingUiErr, setHoldingUiErr] = useState<string | null>(null);
  const [holdingBusyOrgId, setHoldingBusyOrgId] = useState<string | null>(null);
  const [assignHoldingByOrg, setAssignHoldingByOrg] = useState<
    Record<string, string>
  >({});

  const loadHoldingUi = useCallback(async () => {
    setHoldingUiErr(null);
    const [treeRes, holdingsRes] = await Promise.all([
      apiFetch("/api/organizations/tree"),
      apiFetch("/api/holdings"),
    ]);
    if (!treeRes.ok) {
      setHoldingUiErr(`${t("common.loadErr")}: ${treeRes.status}`);
      setTree(null);
      return;
    }
    setTree((await treeRes.json()) as OrganizationsTree);
    if (holdingsRes.ok) {
      setHoldings((await holdingsRes.json()) as HoldingListItem[]);
    } else {
      setHoldings([]);
    }
  }, [t]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadHoldingUi();
  }, [ready, token, loadHoldingUi]);

  const orgRoleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of organizations) {
      m.set(o.id, o.role);
    }
    return m;
  }, [organizations]);

  const roleVariant = useCallback((role: string) => {
    if (role === "OWNER") return "owner";
    if (role === "ADMIN") return "admin";
    if (role === "ACCOUNTANT") return "accountant";
    if (role === "USER") return "user";
    return "neutral";
  }, []);

  const roleLabel = useCallback(
    (role: string) =>
      t(`common.role${role}` as never, {
        defaultValue: role,
      }),
    [t],
  );

  const isOwnerOnly = useCallback(
    (orgId: string) => {
      const r = orgRoleById.get(orgId) ?? "";
      return r === "OWNER";
    },
    [orgRoleById],
  );

  async function attachToHolding(organizationId: string) {
    const holdingId = (assignHoldingByOrg[organizationId] ?? "").trim();
    if (!holdingId) return;
    setHoldingBusyOrgId(organizationId);
    setHoldingUiErr(null);
    try {
      const res = await apiFetch(
        `/api/holdings/${encodeURIComponent(holdingId)}/organizations/${encodeURIComponent(organizationId)}`,
        { method: "POST" },
      );
      if (!res.ok) {
        setHoldingUiErr(await res.text());
        return;
      }
      await loadHoldingUi();
    } finally {
      setHoldingBusyOrgId(null);
    }
  }

  async function detachFromHolding(holdingId: string, organizationId: string) {
    setHoldingBusyOrgId(organizationId);
    setHoldingUiErr(null);
    try {
      const res = await apiFetch(
        `/api/holdings/${encodeURIComponent(holdingId)}/organizations/${encodeURIComponent(organizationId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setHoldingUiErr(await res.text());
        return;
      }
      await loadHoldingUi();
    } finally {
      setHoldingBusyOrgId(null);
    }
  }

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
      // toast is global; keep page minimal
    }
  }

  const freeOrgs = tree?.freeOrganizations ?? [];
  const freeOwned = freeOrgs.filter((o) => (orgRoleById.get(o.id) ?? "") === "OWNER");
  const freeManaged = freeOrgs.filter((o) => (orgRoleById.get(o.id) ?? "") !== "OWNER");

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {t("companiesPage.title")}
          </h1>
          <p className="text-gray-600 mt-2">{t("companiesPage.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setVoenModalOpen(true)}
          >
            <Send className="h-4 w-4" aria-hidden />
            {t("companiesPage.joinTitle")}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setCreateHoldingOpen(true)}
          >
            <Building2 className="h-4 w-4" aria-hidden />
            {t("holdingCreate.openBtn")}
          </button>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => setCreateModalOpen(true)}
            aria-label={t("companiesPage.addCompanyAria")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("companiesPage.modals.createCompanyTitle")}
          </button>
        </div>
      </div>

      {holdingUiErr ? (
        <div className={`${CARD_CONTAINER_CLASS} p-3 text-sm text-red-600`}>
          {holdingUiErr}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-gray-900">
              {t("companiesPage.holdingTitle")}
            </h2>
            <Link href="/holding" className={LINK_ACCENT_CLASS}>
              {t("companiesPage.holdingOpenDash")}
            </Link>
          </div>
          <p className="text-sm text-gray-600">{t("companiesPage.holdingHint")}</p>

          <div className="space-y-3">
            {(tree?.holdings ?? []).map((h) => (
              <div key={h.holdingId} className={`${CARD_CONTAINER_CLASS} p-4`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">
                      {h.holdingName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t("companiesPage.holdingBase")}: {h.baseCurrency}
                    </div>
                  </div>
                  <Link
                    href={`/holding?id=${encodeURIComponent(h.holdingId)}`}
                    className={`${LINK_ACCENT_CLASS} shrink-0`}
                  >
                    {t("companiesPage.holdingOpen")}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>

                {h.organizations.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500">
                    {t("companiesPage.holdingNoCompanies")}
                  </p>
                ) : (
                  <div className="mt-3 rounded-[2px] border border-[#D5DADF] bg-[#EBEDF0]/40">
                    <ul className="divide-y divide-[#D5DADF]">
                      {h.organizations.map((o) => {
                        const role = orgRoleById.get(o.id) ?? "";
                        return (
                          <li
                            key={o.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 py-2 bg-white"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="font-medium text-gray-900 truncate">
                                  {o.name}
                                </div>
                                {role ? (
                                  <Badge variant={roleVariant(role)} title={roleLabel(role)}>
                                    {roleLabel(role)}
                                  </Badge>
                                ) : null}
                                {o.id === user?.organizationId ? (
                                  <Badge variant="neutral">{t("companiesPage.current")}</Badge>
                                ) : null}
                              </div>
                              <div className="text-xs text-gray-500">
                                VÖEN {o.taxId} · {o.currency}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 sm:shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  void openOrg({
                                    id: o.id,
                                    name: o.name,
                                    taxId: o.taxId,
                                    currency: o.currency,
                                    role,
                                  } as OrgSummary)
                                }
                                className={PRIMARY_BUTTON_CLASS}
                              >
                                {t("companiesPage.open")}
                              </button>

                              {isOwnerOnly(o.id) ? (
                                <button
                                  type="button"
                                  disabled={holdingBusyOrgId === o.id}
                                  onClick={() => void detachFromHolding(h.holdingId, o.id)}
                                  className={`${SECONDARY_BUTTON_CLASS} disabled:opacity-50`}
                                  title={t("companiesPage.holdingDetach")}
                                >
                                  <Link2Off className="h-4 w-4" aria-hidden />
                                  {holdingBusyOrgId === o.id
                                    ? t("common.loading")
                                    : t("companiesPage.holdingDetach")}
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">
            {t("orgSwitcher.freeCompanies")}
          </h2>
          <p className="text-sm text-gray-600">{t("companiesPage.freeHint")}</p>

          <div className="space-y-3">
            <div className={`${CARD_CONTAINER_CLASS} p-4`}>
              <div className="font-semibold text-gray-900">
                {t("companiesPage.ownedGroupTitle")}
              </div>
              {freeOwned.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">{t("companiesPage.freeNone")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#D5DADF]">
                  {freeOwned.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{o.name}</div>
                          <Badge variant="owner">{roleLabel("OWNER")}</Badge>
                        </div>
                        <div className="text-xs text-gray-500">
                          VÖEN {o.taxId} · {o.currency}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:shrink-0">
                        <button
                          type="button"
                          className={PRIMARY_BUTTON_CLASS}
                          onClick={() =>
                            void openOrg({
                              id: o.id,
                              name: o.name,
                              taxId: o.taxId,
                              currency: o.currency,
                              role: "OWNER",
                            } as OrgSummary)
                          }
                        >
                          {t("companiesPage.open")}
                        </button>
                        <select
                          className={`${FORM_INPUT_CLASS} !h-8 !min-h-8 text-sm`}
                          value={assignHoldingByOrg[o.id] ?? ""}
                          onChange={(e) =>
                            setAssignHoldingByOrg((prev) => ({
                              ...prev,
                              [o.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">{t("companiesPage.chooseHolding")}</option>
                          {holdings.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!assignHoldingByOrg[o.id] || holdingBusyOrgId === o.id}
                          onClick={() => void attachToHolding(o.id)}
                          className={`${SECONDARY_BUTTON_CLASS} disabled:opacity-50`}
                          title={t("companiesPage.holdingAttach")}
                        >
                          <Unlink2 className="h-4 w-4" aria-hidden />
                          {holdingBusyOrgId === o.id
                            ? t("common.loading")
                            : t("companiesPage.holdingAttach")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`${CARD_CONTAINER_CLASS} p-4`}>
              <div className="font-semibold text-gray-900">
                {t("companiesPage.managedGroupTitle")}
              </div>
              {freeManaged.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">{t("companiesPage.freeNone")}</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#D5DADF]">
                  {freeManaged.map((o) => {
                    const role = orgRoleById.get(o.id) ?? "";
                    return (
                      <li
                        key={o.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{o.name}</div>
                            {role ? (
                              <Badge variant={roleVariant(role)} title={roleLabel(role)}>
                                {roleLabel(role)}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500">
                            VÖEN {o.taxId} · {o.currency}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={PRIMARY_BUTTON_CLASS}
                          onClick={() =>
                            void openOrg({
                              id: o.id,
                              name: o.name,
                              taxId: o.taxId,
                              currency: o.currency,
                              role,
                            } as OrgSummary)
                          }
                        >
                          {t("companiesPage.open")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>

      <p className="text-sm">
        <Link href="/" className={LINK_ACCENT_CLASS}>
          {t("companiesPage.backHome")}
        </Link>
      </p>

      <VoenRequestModal open={voenModalOpen} onClose={() => setVoenModalOpen(false)} />
      <CreateCompanyModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
      <CreateHoldingModal
        open={createHoldingOpen}
        onClose={() => setCreateHoldingOpen(false)}
        onCreated={() => {
          void loadHoldingUi();
        }}
      />
    </div>
  );
}
