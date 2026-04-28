"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useRouter } from "next/navigation";
import { EmptyState } from "../../components/empty-state";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

type Tab =
  | "dashboard"
  | "orgs"
  | "users"
  | "subs"
  | "i18n"
  | "logs"
  | "chartTemplate";

type SubsSubTab = "pricing" | "quotas" | "bundles";

type BillingPayload = {
  prices: Record<string, number>;
  quotas: Record<string, unknown>;
  foundationMonthlyAzn: number;
  yearlyDiscountPercent: number;
  quotaPricing: {
    employeeBlockSize: number;
    pricePerEmployeeBlockAzn: number;
    documentPackSize: number;
    pricePerDocumentPackAzn: number;
  };
  pricingModules: Array<{
    id: string;
    key: string;
    name: string;
    pricePerMonth: number;
    sortOrder: number;
  }>;
  pricingBundles: Array<{
    id: string;
    name: string;
    discountPercent: number;
    moduleKeys: string[];
  }>;
};

const MODULE_SLUG_PRESETS = [
  "production",
  "manufacturing",
  "fixed_assets",
  "ifrs",
  "banking_pro",
  "hr_full",
] as const;

/** ISO из БД (UTC) → YYYY-MM-DD для input type="date" без сдвига календарного дня. */
function isoToDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addOneYearFromTodayDateInput(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tierLabel(tier: string, t: TFunction): string {
  if (tier === "STARTER" || tier === "BUSINESS" || tier === "ENTERPRISE") {
    return t(`superAdmin.tier${tier}`);
  }
  return tier;
}

function roleLabel(role: string, t: TFunction): string {
  if (
    role === "OWNER" ||
    role === "ADMIN" ||
    role === "ACCOUNTANT" ||
    role === "USER"
  ) {
    return t(`superAdmin.role${role}`);
  }
  return role;
}

function BundleSwitch({
  checked,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#2980B9] focus:ring-offset-1",
        checked
          ? "border-[#2980B9] bg-[#2980B9]"
          : "border-[#D5DADF] bg-[#EBEDF0]",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

function computeBundlePreview(
  foundation: number,
  modules: BillingPayload["pricingModules"],
  selectedKeys: string[],
  bundleDiscountPct: number,
  yearlyDiscPct: number,
) {
  const keySet = new Set(selectedKeys);
  const modulesSum = modules
    .filter((m) => keySet.has(m.key))
    .reduce((s, m) => s + m.pricePerMonth, 0);
  const subtotal = foundation + modulesSum;
  const afterBundle = subtotal * (1 - bundleDiscountPct / 100);
  const monthly = afterBundle;
  const yearly = monthly * 12 * (1 - yearlyDiscPct / 100);
  return { subtotal, modulesSum, afterBundle, monthly, yearly };
}

function moduleNamesFromKeys(
  keys: string[],
  modules: BillingPayload["pricingModules"],
): string {
  const map = new Map(modules.map((m) => [m.key, m.name]));
  if (keys.length === 0) return "—";
  return keys.map((k) => map.get(k) ?? k).join(", ");
}

type OrgSubscription = {
  tier: string;
  isTrial: boolean;
  isBlocked: boolean;
  expiresAt: string | null;
  activeModules?: string[];
};

type OrgRow = {
  id: string;
  name: string;
  taxId: string;
  primaryUserId: string | null;
  subscription: OrgSubscription | null;
};

type UserOrgItem = {
  organizationId: string;
  organizationName: string;
  taxId: string;
  role: string;
  joinedAt: string;
  subscription: OrgSubscription | null;
};

export default function SuperAdminPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, ready, token, refreshSession, impersonateAsUser } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<{
    totalOrganizations: number;
    revenueTotalAzn: string;
    newUsers24h: number;
    activeTrials: number;
  } | null>(null);
  const [orgQ, setOrgQ] = useState("");
  const [orgPage, setOrgPage] = useState(1);
  const [usersQ, setUsersQ] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [users, setUsers] = useState<{
    total: number;
    items: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      fullName: string | null;
      isSuperAdmin: boolean;
      membershipCount: number;
      createdAt: string;
    }>;
  } | null>(null);
  const [orgs, setOrgs] = useState<{
    total: number;
    items: OrgRow[];
  } | null>(null);
  const [billing, setBilling] = useState<BillingPayload | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingLoadError, setBillingLoadError] = useState<string | null>(null);
  const [billingLoadTimedOut, setBillingLoadTimedOut] = useState(false);
  const [subsSubTab, setSubsSubTab] = useState<SubsSubTab>("pricing");
  const [foundationStr, setFoundationStr] = useState("");
  const [yearlyDiscStr, setYearlyDiscStr] = useState("");
  const [quotaStr, setQuotaStr] = useState({
    employeeBlockSize: "",
    pricePerEmployeeBlockAzn: "",
    documentPackSize: "",
    pricePerDocumentPackAzn: "",
  });
  const [modulePriceEdits, setModulePriceEdits] = useState<
    Record<string, string>
  >({});
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundleDisc, setNewBundleDisc] = useState("0");
  const [newBundleMods, setNewBundleMods] = useState<Record<string, boolean>>(
    {},
  );
  const [i18nLocale, setI18nLocale] = useState("az");
  const [i18nQ, setI18nQ] = useState("");
  const [i18nRows, setI18nRows] = useState<
    Array<{
      id: string | null;
      key: string;
      value: string;
      isOverride?: boolean;
    }>
  >([]);
  const [i18nTotal, setI18nTotal] = useState<number | null>(null);
  const [i18nKey, setI18nKey] = useState("");
  const [i18nVal, setI18nVal] = useState("");
  const [logOrg, setLogOrg] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState<{
    total: number;
    items: Array<{
      id: string;
      organizationId: string | null;
      action: string;
      entityType: string;
      createdAt: string;
    }>;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [chartTpl, setChartTpl] = useState<
    Array<{
      id: string;
      code: string;
      nameAz: string;
      nameRu: string;
      nameEn: string;
      accountType: string;
      parentCode: string | null;
      cashProfile: string | null;
      sortOrder: number;
      isDeprecated: boolean;
    }>
  | null>(null);
  const [chartTplBusy, setChartTplBusy] = useState(false);
  const [newTpl, setNewTpl] = useState({
    code: "",
    nameAz: "",
    nameRu: "",
    nameEn: "",
    accountType: "EXPENSE",
    parentCode: "",
    sortOrder: 0,
  });

  const [subModalOrg, setSubModalOrg] = useState<OrgRow | null>(null);
  const [subTier, setSubTier] = useState<"STARTER" | "BUSINESS" | "ENTERPRISE">(
    "STARTER",
  );
  const [subExpires, setSubExpires] = useState("");
  const [subBlocked, setSubBlocked] = useState(false);
  const [subPreset, setSubPreset] = useState<Record<string, boolean>>({});
  const [subExtra, setSubExtra] = useState("");
  const [subSaving, setSubSaving] = useState(false);

  const [userOrgsUserId, setUserOrgsUserId] = useState<string | null>(null);
  const [userOrgsData, setUserOrgsData] = useState<{
    userId: string;
    email: string;
    items: UserOrgItem[];
  } | null>(null);
  const [userOrgsLoading, setUserOrgsLoading] = useState(false);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    setErr(null);
    const res = await apiFetch("/api/admin/stats");
    if (!res.ok) {
      setErr(`${res.status}`);
      return;
    }
    setStats(await res.json());
  }, [token]);

  const loadOrgs = useCallback(async () => {
    if (!token) return;
    setErr(null);
    const q = new URLSearchParams({
      page: String(orgPage),
      pageSize: "20",
    });
    if (orgQ.trim()) q.set("q", orgQ.trim());
    const res = await apiFetch(`/api/admin/organizations?${q}`);
    if (!res.ok) {
      setErr(`${res.status}`);
      return;
    }
    setOrgs((await res.json()) as { total: number; items: OrgRow[] });
  }, [token, orgPage, orgQ]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setErr(null);
    const q = new URLSearchParams({
      page: String(usersPage),
      pageSize: "20",
    });
    if (usersQ.trim()) q.set("q", usersQ.trim());
    const res = await apiFetch(`/api/admin/users?${q}`);
    if (!res.ok) {
      setErr(`${res.status}`);
      return;
    }
    setUsers(await res.json());
  }, [token, usersPage, usersQ]);

  const loadBilling = useCallback(async () => {
    if (!token) return;
    setBillingLoading(true);
    setBillingLoadError(null);
    setBillingLoadTimedOut(false);
    try {
      const res = await apiFetch("/api/admin/config/billing");
      if (!res.ok) {
        setBillingLoadError(`HTTP ${res.status}`);
        setBilling(null);
        return;
      }
      const raw = (await res.json()) as Partial<BillingPayload>;
      const data: BillingPayload = {
        prices: raw.prices ?? {},
        quotas: raw.quotas ?? {},
        foundationMonthlyAzn: raw.foundationMonthlyAzn ?? 29,
        yearlyDiscountPercent: raw.yearlyDiscountPercent ?? 20,
        quotaPricing: raw.quotaPricing ?? {
          employeeBlockSize: 10,
          pricePerEmployeeBlockAzn: 15,
          documentPackSize: 1000,
          pricePerDocumentPackAzn: 5,
        },
        pricingModules: raw.pricingModules ?? [],
        pricingBundles: raw.pricingBundles ?? [],
      };
      setBilling(data);
      setFoundationStr(String(data.foundationMonthlyAzn ?? ""));
      setYearlyDiscStr(String(data.yearlyDiscountPercent ?? ""));
      const qp = data.quotaPricing;
      setQuotaStr({
        employeeBlockSize: String(qp?.employeeBlockSize ?? ""),
        pricePerEmployeeBlockAzn: String(qp?.pricePerEmployeeBlockAzn ?? ""),
        documentPackSize: String(qp?.documentPackSize ?? ""),
        pricePerDocumentPackAzn: String(qp?.pricePerDocumentPackAzn ?? ""),
      });
      const mp: Record<string, string> = {};
      for (const m of data.pricingModules ?? []) {
        mp[m.id] = String(m.pricePerMonth);
      }
      setModulePriceEdits(mp);
      setBillingLoadTimedOut(false);
    } catch (e) {
      setBillingLoadError(e instanceof Error ? e.message : "error");
      setBilling(null);
    } finally {
      setBillingLoading(false);
    }
  }, [token]);

  const resetPricingCatalog = useCallback(async () => {
    if (!token) return;
    setBillingLoadError(null);
    try {
      const res = await apiFetch("/api/admin/config/billing/seed-pricing", {
        method: "POST",
      });
      if (!res.ok) {
        setBillingLoadError(`HTTP ${res.status}`);
        return;
      }
      await loadBilling();
    } catch (e) {
      setBillingLoadError(e instanceof Error ? e.message : "error");
    }
  }, [token, loadBilling]);

  useEffect(() => {
    if (tab !== "subs" || !billingLoading) return;
    const id = window.setTimeout(() => {
      setBillingLoadTimedOut(true);
    }, 5000);
    return () => window.clearTimeout(id);
  }, [tab, billingLoading]);

  useEffect(() => {
    if (!billing?.pricingModules?.length) return;
    setNewBundleMods((prev) => {
      const o = { ...prev };
      for (const m of billing.pricingModules) {
        if (!(m.key in o)) o[m.key] = false;
      }
      return o;
    });
  }, [billing]);

  const loadI18n = useCallback(async () => {
    if (!token) return;
    const q = new URLSearchParams({ locale: i18nLocale, take: "20000" });
    if (i18nQ.trim()) q.set("q", i18nQ.trim());
    const res = await apiFetch(`/api/admin/translations?${q}`);
    if (!res.ok) return;
    const data = await res.json();
    setI18nRows(data.items ?? []);
    setI18nTotal(typeof data.total === "number" ? data.total : null);
  }, [token, i18nLocale, i18nQ]);

  const loadLogs = useCallback(async () => {
    if (!token) return;
    const q = new URLSearchParams({ take: "50" });
    if (logOrg.trim()) q.set("organizationId", logOrg.trim());
    const res = await apiFetch(`/api/admin/audit-logs?${q}`);
    if (!res.ok) return;
    setLogs(await res.json());
  }, [token, logOrg]);

  const loadChartTemplate = useCallback(async () => {
    if (!token) return;
    setErr(null);
    setChartTplBusy(true);
    const res = await apiFetch("/api/admin/chart-template");
    setChartTplBusy(false);
    if (!res.ok) {
      setErr(`${res.status}`);
      return;
    }
    setChartTpl(
      (await res.json()) as Array<{
        id: string;
        code: string;
        nameAz: string;
        nameRu: string;
        nameEn: string;
        accountType: string;
        parentCode: string | null;
        cashProfile: string | null;
        sortOrder: number;
        isDeprecated: boolean;
      }>,
    );
  }, [token]);

  const saveChartTemplateRow = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!token) return;
      setErr(null);
      const res = await apiFetch("/api/admin/chart-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newTpl.code.trim(),
          nameAz: newTpl.nameAz.trim(),
          nameRu: newTpl.nameRu.trim(),
          nameEn: newTpl.nameEn.trim(),
          accountType: newTpl.accountType,
          parentCode: newTpl.parentCode.trim() || null,
          sortOrder: Number(newTpl.sortOrder) || 0,
          isDeprecated: false,
        }),
      });
      if (!res.ok) {
        setErr(`${res.status}: ${await res.text()}`);
        return;
      }
      setNewTpl({
        code: "",
        nameAz: "",
        nameRu: "",
        nameEn: "",
        accountType: "EXPENSE",
        parentCode: "",
        sortOrder: 0,
      });
      void loadChartTemplate();
    },
    [token, newTpl, loadChartTemplate],
  );

  const openSubModal = useCallback((o: OrgRow) => {
    setSubModalOrg(o);
    const sub = o.subscription;
    const tier =
      sub?.tier === "BUSINESS" || sub?.tier === "ENTERPRISE"
        ? sub.tier
        : "STARTER";
    setSubTier(tier);
    let exp = isoToDateInputValue(sub?.expiresAt);
    if (!exp && tier === "ENTERPRISE") {
      exp = addOneYearFromTodayDateInput();
    }
    setSubExpires(exp);
    setSubBlocked(sub?.isBlocked ?? false);
    const mods = new Set(sub?.activeModules ?? []);
    const preset: Record<string, boolean> = {};
    for (const s of MODULE_SLUG_PRESETS) {
      preset[s] = mods.has(s);
    }
    setSubPreset(preset);
    const extraMods = (sub?.activeModules ?? []).filter(
      (m) => !MODULE_SLUG_PRESETS.includes(m as (typeof MODULE_SLUG_PRESETS)[number]),
    );
    setSubExtra(extraMods.join(", "));
  }, []);

  const saveSubscription = useCallback(async () => {
    if (!token || !subModalOrg) return;
    setSubSaving(true);
    setErr(null);
    const fromPresets = MODULE_SLUG_PRESETS.filter((s) => subPreset[s]);
    const extra = subExtra
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const activeModules = [...new Set([...fromPresets, ...extra])];
    const expiresAt =
      subExpires.trim() === ""
        ? null
        : new Date(`${subExpires.trim()}T12:00:00.000Z`).toISOString();
    const res = await apiFetch(
      `/api/admin/organizations/${subModalOrg.id}/subscription`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: subTier,
          expiresAt,
          isBlocked: subBlocked,
          activeModules,
        }),
      },
    );
    setSubSaving(false);
    if (!res.ok) {
      setErr(`${res.status}`);
      return;
    }
    setSubModalOrg(null);
    void loadOrgs();
  }, [
    token,
    subModalOrg,
    subTier,
    subExpires,
    subBlocked,
    subPreset,
    subExtra,
    loadOrgs,
  ]);

  const openUserOrgsModal = useCallback(
    async (userId: string) => {
      if (!token) return;
      setUserOrgsUserId(userId);
      setUserOrgsData(null);
      setUserOrgsLoading(true);
      setErr(null);
      const res = await apiFetch(`/api/admin/users/${userId}/organizations`);
      setUserOrgsLoading(false);
      if (!res.ok) {
        setErr(`${res.status}`);
        setUserOrgsUserId(null);
        return;
      }
      setUserOrgsData(await res.json());
    },
    [token],
  );

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    if (tab === "dashboard") void loadStats();
  }, [ready, token, user?.isSuperAdmin, tab, loadStats]);

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    if (tab === "orgs") void loadOrgs();
  }, [ready, token, user?.isSuperAdmin, tab, loadOrgs]);

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    if (tab === "users") void loadUsers();
  }, [ready, token, user?.isSuperAdmin, tab, loadUsers]);

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    if (tab === "subs") void loadBilling();
  }, [ready, token, user?.isSuperAdmin, tab, loadBilling]);

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    if (tab === "i18n") void loadI18n();
  }, [ready, token, user?.isSuperAdmin, tab, loadI18n]);

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    if (tab === "logs") void loadLogs();
  }, [ready, token, user?.isSuperAdmin, tab, loadLogs]);

  useEffect(() => {
    if (!ready || !token || !user?.isSuperAdmin) return;
    if (tab === "chartTemplate") void loadChartTemplate();
  }, [ready, token, user?.isSuperAdmin, tab, loadChartTemplate]);

  if (!ready) {
    return (
      <div className="text-sm text-gray-500 py-12 text-center">
        {t("common.loading")}
      </div>
    );
  }

  if (!token || !user?.isSuperAdmin) {
    return (
      <EmptyState
        title={t("superAdmin.forbidden")}
        className="border-solid border-[#D5DADF] bg-white"
      />
    );
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      className={[
        "px-3 py-2 rounded-[2px] text-[13px] font-medium transition",
        tab === id
          ? "bg-[#2980B9] text-white shadow-sm ring-2 ring-[#2980B9] ring-offset-1"
          : "bg-white border border-[#D5DADF] text-[#34495E] hover:bg-[#F8F9FA]",
      ].join(" ")}
    >
      {label}
    </button>
  );

  const fmtExpires = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toISOString().slice(0, 19).replace("T", " ");
    } catch {
      return "—";
    }
  };

  const fmtModules = (m: string[] | undefined): string =>
    m && m.length > 0 ? m.join(", ") : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#34495E]">
          {t("superAdmin.pageTitle")}
        </h1>
        <p className="text-[13px] text-[#7F8C8D] mt-1">{user.email}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn("dashboard", t("superAdmin.tabDashboard"))}
        {tabBtn("orgs", t("superAdmin.tabOrganizations"))}
        {tabBtn("users", t("superAdmin.tabUsers"))}
        {tabBtn("subs", t("superAdmin.tabSubscriptions"))}
        {tabBtn("i18n", t("superAdmin.tabLocalization"))}
        {tabBtn("logs", t("superAdmin.tabLogs"))}
        {tabBtn("chartTemplate", t("superAdmin.tabChartTemplate"))}
      </div>

      {err ? (
        <EmptyState
          title={t("common.apiErrorTitle")}
          description={`API ${err}`}
        />
      ) : null}

      {tab === "dashboard" && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            [t("superAdmin.statsOrganizations"), String(stats.totalOrganizations)],
            [t("superAdmin.statsRevenue"), stats.revenueTotalAzn],
            [t("superAdmin.statsNewUsers"), String(stats.newUsers24h)],
            [t("superAdmin.statsTrials"), String(stats.activeTrials)],
          ].map(([k, v]) => (
            <div key={k} className={`${CARD_CONTAINER_CLASS} p-4`}>
              <div className="text-xs font-semibold uppercase text-[#7F8C8D]">
                {k}
              </div>
              <div className="text-2xl font-bold text-[#34495E] mt-1 tabular-nums text-right">
                {v}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "orgs" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[200px]"
              placeholder={t("superAdmin.searchVoen")}
              value={orgQ}
              onChange={(e) => setOrgQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setOrgPage(1);
                  void loadOrgs();
                }
              }}
            />
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => {
                setOrgPage(1);
                void loadOrgs();
              }}
            >
              {t("superAdmin.search")}
            </button>
          </div>
          {orgs && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">{t("superAdmin.orgColVoen")}</th>
                    <th className="px-3 py-2">{t("superAdmin.orgColName")}</th>
                    <th className="px-3 py-2">{t("superAdmin.orgColTier")}</th>
                    <th className="px-3 py-2">{t("superAdmin.orgColExpires")}</th>
                    <th className="px-3 py-2">{t("superAdmin.orgColTrial")}</th>
                    <th className="px-3 py-2">{t("superAdmin.orgColBlocked")}</th>
                    <th className="px-3 py-2">{t("superAdmin.orgColActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.items.map((o) => (
                    <tr key={o.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono">{o.taxId}</td>
                      <td className="px-3 py-2">{o.name}</td>
                      <td className="px-3 py-2">
                        {o.subscription
                          ? tierLabel(o.subscription.tier, t)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {fmtExpires(o.subscription?.expiresAt)}
                      </td>
                      <td className="px-3 py-2">
                        {o.subscription?.isTrial
                          ? t("common.yes")
                          : t("common.no")}
                      </td>
                      <td className="px-3 py-2">
                        {o.subscription?.isBlocked
                          ? t("common.yes")
                          : t("common.no")}
                      </td>
                      <td className="px-3 py-2 text-right space-x-3 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-action hover:underline text-sm"
                          onClick={() => openSubModal(o)}
                        >
                          {t("superAdmin.orgEditSubscription")}
                        </button>
                        {o.primaryUserId ? (
                          <button
                            type="button"
                            className="text-action hover:underline text-sm"
                            onClick={() => {
                              void impersonateAsUser(o.primaryUserId!).then(
                                () => router.push("/"),
                              );
                            }}
                          >
                            {t("superAdmin.loginAs")}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-gray-500 flex justify-between">
                <span>{t("superAdmin.totalLabel", { count: orgs.total })}</span>
                <span>
                  <button
                    type="button"
                    className="text-action disabled:opacity-40"
                    disabled={orgPage <= 1}
                    onClick={() => setOrgPage((p) => Math.max(1, p - 1))}
                  >
                    {t("superAdmin.prev")}
                  </button>
                  <span className="mx-2">
                    {t("superAdmin.pageLabel", { page: orgPage })}
                  </span>
                  <button
                    type="button"
                    className="text-action disabled:opacity-40"
                    disabled={orgPage * 20 >= orgs.total}
                    onClick={() => setOrgPage((p) => p + 1)}
                  >
                    {t("superAdmin.next")}
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[200px]"
              placeholder={t("superAdmin.searchUsers")}
              value={usersQ}
              onChange={(e) => setUsersQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setUsersPage(1);
                  void loadUsers();
                }
              }}
            />
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => {
                setUsersPage(1);
                void loadUsers();
              }}
            >
              {t("superAdmin.search")}
            </button>
          </div>
          {users && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">{t("superAdmin.usersColEmail")}</th>
                    <th className="px-3 py-2">{t("superAdmin.usersColName")}</th>
                    <th className="px-3 py-2">{t("superAdmin.usersColSuper")}</th>
                    <th className="px-3 py-2">{t("superAdmin.usersColOrgs")}</th>
                    <th className="px-3 py-2">
                      {t("superAdmin.usersColCreated")}
                    </th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((u) => (
                    <tr key={u.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                      <td className="px-3 py-2">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
                          u.fullName ||
                          "—"}
                      </td>
                      <td className="px-3 py-2">
                        {u.isSuperAdmin ? t("common.yes") : t("common.no")}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {u.membershipCount > 0 ? (
                          <button
                            type="button"
                            className="text-action hover:underline font-medium"
                            onClick={() => void openUserOrgsModal(u.id)}
                          >
                            {u.membershipCount}
                          </button>
                        ) : (
                          <span className="text-gray-500">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {u.createdAt.slice(0, 19).replace("T", " ")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="text-action hover:underline"
                          onClick={() => {
                            void impersonateAsUser(u.id).then(() =>
                              router.push("/"),
                            );
                          }}
                        >
                          {t("superAdmin.loginAs")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-gray-500 flex justify-between">
                <span>
                  {t("superAdmin.totalLabel", { count: users.total })}
                </span>
                <span>
                  <button
                    type="button"
                    className="text-action disabled:opacity-40"
                    disabled={usersPage <= 1}
                    onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                  >
                    {t("superAdmin.prev")}
                  </button>
                  <span className="mx-2">
                    {t("superAdmin.pageLabel", { page: usersPage })}
                  </span>
                  <button
                    type="button"
                    className="text-action disabled:opacity-40"
                    disabled={usersPage * 20 >= users.total}
                    onClick={() => setUsersPage((p) => p + 1)}
                  >
                    {t("superAdmin.next")}
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "subs" && (
        <div className="space-y-6 max-w-4xl">
          {billingLoadError && !billing ? (
            <EmptyState
              title={t("superAdmin.billingLoadFailed")}
              description={billingLoadError}
              className={`${CARD_CONTAINER_CLASS} !border-solid`}
              action={
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => void resetPricingCatalog()}
                >
                  {t("superAdmin.billingResetPrice")}
                </button>
              }
            />
          ) : null}
          {!billing && !billingLoadError && !billingLoadTimedOut ? (
            <div className={`${CARD_CONTAINER_CLASS} p-8 space-y-3`}>
              <p className="text-sm text-[#7F8C8D] text-center">
                {t("common.loading")}
              </p>
            </div>
          ) : null}
          {!billing && (billingLoadTimedOut || billingLoadError) ? (
            <div className={`${CARD_CONTAINER_CLASS} p-6 space-y-4`}>
              <h2 className="text-sm font-bold text-[#34495E] uppercase tracking-wide">
                {t("superAdmin.billingFallbackTitle")}
              </h2>
              <p className="text-xs text-[#7F8C8D]">{t("superAdmin.billingFallbackHint")}</p>
              {billingLoadTimedOut && billingLoading ? (
                <p className="text-xs text-[#34495E]">{t("superAdmin.billingLoadSlow")}</p>
              ) : null}
              <label className="block text-sm text-[#34495E] max-w-xs">
                {t("superAdmin.priceAzn")}
                <input
                  className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                  value={foundationStr || "29"}
                  onChange={(e) => setFoundationStr(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={async () => {
                    const n = Number.parseFloat(foundationStr || "29");
                    if (!Number.isFinite(n) || n < 0) return;
                    await apiFetch("/api/admin/config/billing/foundation", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ amountAzn: n }),
                    });
                    void loadBilling();
                  }}
                >
                  {t("superAdmin.billingSave")}
                </button>
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => void resetPricingCatalog()}
                >
                  {t("superAdmin.billingResetPrice")}
                </button>
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => void loadBilling()}
                >
                  {t("superAdmin.billingRetryLoad")}
                </button>
              </div>
            </div>
          ) : null}
          {billing ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSubsSubTab("pricing")}
                  className={[
                    "px-3 py-2 rounded-[2px] text-[13px] font-medium transition",
                    subsSubTab === "pricing"
                      ? "bg-[#2980B9] text-white shadow-sm ring-2 ring-[#2980B9] ring-offset-1"
                      : "bg-white border border-[#D5DADF] text-[#34495E] hover:bg-[#F8F9FA]",
                  ].join(" ")}
                >
                  {t("superAdmin.billingTabPricing")}
                </button>
                <button
                  type="button"
                  onClick={() => setSubsSubTab("quotas")}
                  className={[
                    "px-3 py-2 rounded-[2px] text-[13px] font-medium transition",
                    subsSubTab === "quotas"
                      ? "bg-[#2980B9] text-white shadow-sm ring-2 ring-[#2980B9] ring-offset-1"
                      : "bg-white border border-[#D5DADF] text-[#34495E] hover:bg-[#F8F9FA]",
                  ].join(" ")}
                >
                  {t("superAdmin.billingTabQuotas")}
                </button>
                <button
                  type="button"
                  onClick={() => setSubsSubTab("bundles")}
                  className={[
                    "px-3 py-2 rounded-[2px] text-[13px] font-medium transition",
                    subsSubTab === "bundles"
                      ? "bg-[#2980B9] text-white shadow-sm ring-2 ring-[#2980B9] ring-offset-1"
                      : "bg-white border border-[#D5DADF] text-[#34495E] hover:bg-[#F8F9FA]",
                  ].join(" ")}
                >
                  {t("superAdmin.billingTabBundles")}
                </button>
              </div>

            {subsSubTab === "pricing" ? (
              <div className="space-y-6">
                <div className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
                  <h2 className="text-sm font-bold text-[#34495E] uppercase tracking-wide">
                    {t("superAdmin.billingFoundationTitle")}
                  </h2>
                  <p className="text-xs text-[#7F8C8D]">
                    {t("superAdmin.billingFoundationHint")}
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block text-sm text-[#34495E] flex-1 min-w-[160px]">
                      {t("superAdmin.priceAzn")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={foundationStr}
                        onChange={(e) => setFoundationStr(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className={PRIMARY_BUTTON_CLASS}
                      onClick={async () => {
                        const n = Number.parseFloat(foundationStr);
                        if (!Number.isFinite(n) || n < 0) return;
                        await apiFetch("/api/admin/config/billing/foundation", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ amountAzn: n }),
                        });
                        void loadBilling();
                      }}
                    >
                      {t("superAdmin.billingSave")}
                    </button>
                  </div>
                </div>

                <div className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
                  <h2 className="text-sm font-bold text-[#34495E] uppercase tracking-wide">
                    {t("superAdmin.billingModuleCatalogTitle")}
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left border-b border-[#EBEDF0] text-[13px] font-semibold text-[#34495E]">
                        <tr>
                          <th className="py-2 pr-3">{t("superAdmin.billingColModule")}</th>
                          <th className="py-2 pr-3">{t("superAdmin.billingColPrice")}</th>
                          <th className="py-2 w-28" />
                        </tr>
                      </thead>
                      <tbody>
                        {billing.pricingModules.map((mod) => (
                          <tr
                            key={mod.id}
                            className="border-t border-[#EBEDF0] text-[#34495E]"
                          >
                            <td className="py-2 pr-3 font-medium">{mod.name}</td>
                            <td className="py-2 pr-3">
                              <input
                                className="w-28 border border-[#D5DADF] rounded-[2px] px-2 py-1 text-sm tabular-nums"
                                value={modulePriceEdits[mod.id] ?? ""}
                                onChange={(e) =>
                                  setModulePriceEdits((s) => ({
                                    ...s,
                                    [mod.id]: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                className={PRIMARY_BUTTON_CLASS}
                                onClick={async () => {
                                  const n = Number.parseFloat(
                                    modulePriceEdits[mod.id] ?? "",
                                  );
                                  if (!Number.isFinite(n) || n < 0) return;
                                  await apiFetch(
                                    `/api/admin/pricing-modules/${mod.id}`,
                                    {
                                      method: "PATCH",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        pricePerMonth: n,
                                      }),
                                    },
                                  );
                                  void loadBilling();
                                }}
                              >
                                {t("superAdmin.billingSave")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
            {billing && subsSubTab === "quotas" ? (
              <div className="space-y-6">
                <div className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
                  <h2 className="text-sm font-bold text-[#34495E] uppercase tracking-wide">
                    {t("superAdmin.billingQuotaTitle")}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-sm text-[#34495E]">
                      {t("superAdmin.billingQuotaEmployeeBlock")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={quotaStr.employeeBlockSize}
                        onChange={(e) =>
                          setQuotaStr((s) => ({
                            ...s,
                            employeeBlockSize: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm text-[#34495E]">
                      {t("superAdmin.billingQuotaEmployeePrice")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={quotaStr.pricePerEmployeeBlockAzn}
                        onChange={(e) =>
                          setQuotaStr((s) => ({
                            ...s,
                            pricePerEmployeeBlockAzn: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm text-[#34495E]">
                      {t("superAdmin.billingQuotaDocBlock")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={quotaStr.documentPackSize}
                        onChange={(e) =>
                          setQuotaStr((s) => ({
                            ...s,
                            documentPackSize: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm text-[#34495E]">
                      {t("superAdmin.billingQuotaDocPrice")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={quotaStr.pricePerDocumentPackAzn}
                        onChange={(e) =>
                          setQuotaStr((s) => ({
                            ...s,
                            pricePerDocumentPackAzn: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block text-sm text-[#34495E] flex-1 min-w-[200px]">
                      {t("superAdmin.billingYearlyDiscountLabel")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={yearlyDiscStr}
                        onChange={(e) => setYearlyDiscStr(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className={PRIMARY_BUTTON_CLASS}
                      onClick={async () => {
                        const y = Number.parseFloat(yearlyDiscStr);
                        if (!Number.isFinite(y) || y < 0 || y > 100) return;
                        await apiFetch("/api/admin/config/billing/yearly-discount", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ percent: y }),
                        });
                        const patch = {
                          employeeBlockSize: Number.parseInt(
                            quotaStr.employeeBlockSize,
                            10,
                          ),
                          pricePerEmployeeBlockAzn: Number.parseFloat(
                            quotaStr.pricePerEmployeeBlockAzn,
                          ),
                          documentPackSize: Number.parseInt(
                            quotaStr.documentPackSize,
                            10,
                          ),
                          pricePerDocumentPackAzn: Number.parseFloat(
                            quotaStr.pricePerDocumentPackAzn,
                          ),
                        };
                        if (
                          Number.isFinite(patch.employeeBlockSize) &&
                          Number.isFinite(patch.pricePerEmployeeBlockAzn) &&
                          Number.isFinite(patch.documentPackSize) &&
                          Number.isFinite(patch.pricePerDocumentPackAzn)
                        ) {
                          await apiFetch("/api/admin/config/billing/quota-pricing", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(patch),
                          });
                        }
                        void loadBilling();
                      }}
                    >
                      {t("superAdmin.billingSave")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {billing && subsSubTab === "bundles" ? (
              <div className="space-y-6">
                <div className={`${CARD_CONTAINER_CLASS} p-4 space-y-4`}>
                  <h2 className="text-sm font-bold text-[#34495E] uppercase tracking-wide">
                    {t("superAdmin.billingCreateBundle")}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-sm text-[#34495E] sm:col-span-2">
                      {t("superAdmin.billingBundleName")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={newBundleName}
                        onChange={(e) => setNewBundleName(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm text-[#34495E]">
                      {t("superAdmin.billingBundleDiscount")}
                      <input
                        className="mt-1 w-full border border-[#D5DADF] rounded-[2px] px-2 py-1.5 text-sm"
                        value={newBundleDisc}
                        onChange={(e) => setNewBundleDisc(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-[#7F8C8D] uppercase">
                      {t("superAdmin.billingModulesInBundle")}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {billing.pricingModules.map((mod) => (
                        <div
                          key={mod.key}
                          className="flex items-center justify-between gap-3 rounded-[2px] border border-[#EBEDF0] bg-[#F8F9FA] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[#34495E] truncate">
                              {mod.name}
                            </div>
                          </div>
                          <BundleSwitch
                            checked={Boolean(newBundleMods[mod.key])}
                            onChange={(v) =>
                              setNewBundleMods((s) => ({
                                ...s,
                                [mod.key]: v,
                              }))
                            }
                            aria-label={mod.name}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const disc = Number.parseFloat(newBundleDisc);
                    const selectedKeys = Object.entries(newBundleMods)
                      .filter(([, on]) => on)
                      .map(([k]) => k);
                    const p = computeBundlePreview(
                      billing.foundationMonthlyAzn,
                      billing.pricingModules,
                      selectedKeys,
                      Number.isFinite(disc) ? disc : 0,
                      billing.yearlyDiscountPercent,
                    );
                    return (
                      <div className={`${CARD_CONTAINER_CLASS} p-4 bg-[#EBEDF0]/40 border-[#2980B9]/30`}>
                        <div className="text-xs font-bold text-[#34495E] uppercase mb-2">
                          {t("superAdmin.billingPreviewTitle")}
                        </div>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-[#34495E]">
                          <div>
                            <dt className="text-[#7F8C8D] text-xs">
                              {t("superAdmin.billingPreviewSubtotal")}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                              {p.subtotal.toFixed(2)} AZN
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#7F8C8D] text-xs">
                              {t("superAdmin.billingAfterBundle")}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                              {p.afterBundle.toFixed(2)} AZN / {t("superAdmin.billingPerMonth")}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#7F8C8D] text-xs">
                              {t("superAdmin.billingPreviewYearly")}
                            </dt>
                            <dd className="font-semibold tabular-nums">
                              {p.yearly.toFixed(2)} AZN
                            </dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={async () => {
                      const name = newBundleName.trim();
                      if (!name) return;
                      const disc = Number.parseFloat(newBundleDisc);
                      if (!Number.isFinite(disc) || disc < 0 || disc > 100) return;
                      const moduleKeys = Object.entries(newBundleMods)
                        .filter(([, on]) => on)
                        .map(([k]) => k);
                      await apiFetch("/api/admin/pricing-bundles", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name,
                          discountPercent: disc,
                          moduleKeys,
                        }),
                      });
                      setNewBundleName("");
                      setNewBundleDisc("0");
                      setNewBundleMods((prev) => {
                        const o: Record<string, boolean> = {};
                        for (const k of Object.keys(prev)) o[k] = false;
                        return o;
                      });
                      void loadBilling();
                    }}
                  >
                    {t("superAdmin.billingSave")}
                  </button>
                </div>

                <div className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
                  <h2 className="text-sm font-bold text-[#34495E] uppercase tracking-wide">
                    {t("superAdmin.billingBundlesList")}
                  </h2>
                  {billing.pricingBundles.length === 0 ? (
                    <p className="text-sm text-[#7F8C8D]">
                      {t("superAdmin.billingBundlesEmpty")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {billing.pricingBundles.map((b) => {
                        const p = computeBundlePreview(
                          billing.foundationMonthlyAzn,
                          billing.pricingModules,
                          b.moduleKeys,
                          b.discountPercent,
                          billing.yearlyDiscountPercent,
                        );
                        return (
                          <li
                            key={b.id}
                            className="rounded-[2px] border border-[#D5DADF] p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
                          >
                            <div>
                              <div className="font-semibold text-[#34495E]">
                                {b.name}
                              </div>
                              <div className="text-xs text-[#7F8C8D] mt-1">
                                −{b.discountPercent}% ·{" "}
                                {moduleNamesFromKeys(
                                  b.moduleKeys,
                                  billing.pricingModules,
                                )}
                              </div>
                              <div className="text-xs text-[#34495E] mt-2 tabular-nums">
                                {t("superAdmin.billingPreviewMonthly")}:{" "}
                                {p.monthly.toFixed(2)} AZN ·{" "}
                                {t("superAdmin.billingPreviewYearly")}:{" "}
                                {p.yearly.toFixed(2)} AZN
                              </div>
                            </div>
                            <button
                              type="button"
                              className="text-sm text-red-600 hover:underline self-start"
                              onClick={async () => {
                                await apiFetch(`/api/admin/pricing-bundles/${b.id}`, {
                                  method: "DELETE",
                                });
                                void loadBilling();
                              }}
                            >
                              {t("superAdmin.billingDeleteBundle")}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
            </>
          ) : null}
        </div>
      )}

      {tab === "i18n" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <select
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
              value={i18nLocale}
              onChange={(e) => setI18nLocale(e.target.value)}
            >
              <option value="az">az</option>
              <option value="ru">ru</option>
              <option value="en">en</option>
            </select>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]"
              placeholder={t("superAdmin.i18nSearchPlaceholder")}
              value={i18nQ}
              onChange={(e) => setI18nQ(e.target.value)}
            />
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => void loadI18n()}
            >
              {t("superAdmin.search")}
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={async () => {
                await apiFetch("/api/admin/translations/sync", {
                  method: "POST",
                });
              }}
            >
              {t("superAdmin.syncI18n")}
            </button>
            {i18nTotal !== null ? (
              <span className="text-xs text-gray-500 self-center">
                {t("superAdmin.i18nKeysCount", { count: i18nTotal })}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm md:col-span-1"
              placeholder={t("superAdmin.i18nFormKeyPlaceholder")}
              value={i18nKey}
              onChange={(e) => setI18nKey(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm md:col-span-2"
              placeholder={t("superAdmin.i18nFormValuePlaceholder")}
              value={i18nVal}
              onChange={(e) => setI18nVal(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={async () => {
              if (!i18nKey.trim()) return;
              await apiFetch("/api/admin/translations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  locale: i18nLocale,
                  key: i18nKey.trim(),
                  value: i18nVal,
                }),
              });
              setI18nKey("");
              setI18nVal("");
              void loadI18n();
            }}
          >
            {t("superAdmin.save")}
          </button>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white text-sm">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-2 py-2">{t("superAdmin.i18nColKey")}</th>
                  <th className="px-2 py-2">{t("superAdmin.i18nColValue")}</th>
                  <th className="px-2 py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {i18nRows.map((r) => (
                  <tr
                    key={r.id ?? r.key}
                    className="border-t border-gray-100"
                  >
                    <td className="px-2 py-1.5 font-mono text-xs">{r.key}</td>
                    <td className="px-2 py-1.5">{r.value}</td>
                    <td className="px-2 py-1.5">
                      {r.id ? (
                        <button
                          type="button"
                          className="text-red-600 text-xs"
                          title={t("superAdmin.i18nRemoveOverrideTitle")}
                          onClick={async () => {
                            await apiFetch(`/api/admin/translations/${r.id}`, {
                              method: "DELETE",
                            });
                            void loadI18n();
                          }}
                        >
                          ×
                        </button>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
              placeholder={t("superAdmin.orgIdFilter")}
              value={logOrg}
              onChange={(e) => setLogOrg(e.target.value)}
            />
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => void loadLogs()}
              disabled={logsLoading}
            >
              {t("superAdmin.search")}
            </button>
          </div>
          {logsLoading ? (
            <p className="text-sm text-[#7F8C8D]">{t("superAdmin.logsLoad")}</p>
          ) : null}
          {logs && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white text-xs">
              <table className="min-w-full">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-2 py-2">{t("superAdmin.logsColTime")}</th>
                    <th className="px-2 py-2">{t("superAdmin.logsColOrg")}</th>
                    <th className="px-2 py-2">{t("superAdmin.logsColAction")}</th>
                    <th className="px-2 py-2">{t("superAdmin.logsColEntity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.items.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-2 py-1 whitespace-nowrap">{r.createdAt}</td>
                      <td className="px-2 py-1 font-mono">
                        {r.organizationId ?? "—"}
                      </td>
                      <td className="px-2 py-1">{r.action}</td>
                      <td className="px-2 py-1">{r.entityType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 py-2 text-gray-500">
                {t("superAdmin.logsTotal", { count: logs.total })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "chartTemplate" && (
        <div className="space-y-4">
          <p className="text-[13px] text-[#7F8C8D] max-w-3xl">
            {t("superAdmin.chartTemplateIntro")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              onClick={() => void loadChartTemplate()}
              disabled={chartTplBusy}
            >
              {t("superAdmin.chartTemplateRefresh")}
            </button>
          </div>
          <form
            onSubmit={(e) => void saveChartTemplateRow(e)}
            className={`${CARD_CONTAINER_CLASS} p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-8`}
          >
            <label className="text-xs font-medium text-[#34495E]">
              {t("superAdmin.chartColCode")}
              <input
                required
                value={newTpl.code}
                onChange={(e) => setNewTpl((s) => ({ ...s, code: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-[#34495E]">
              {t("superAdmin.chartColNameAz")}
              <input
                required
                value={newTpl.nameAz}
                onChange={(e) => setNewTpl((s) => ({ ...s, nameAz: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-[#34495E]">
              {t("superAdmin.chartColNameRu")}
              <input
                required
                value={newTpl.nameRu}
                onChange={(e) => setNewTpl((s) => ({ ...s, nameRu: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-[#34495E]">
              {t("superAdmin.chartColNameEn")}
              <input
                required
                value={newTpl.nameEn}
                onChange={(e) => setNewTpl((s) => ({ ...s, nameEn: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-[#34495E]">
              {t("superAdmin.chartColType")}
              <select
                value={newTpl.accountType}
                onChange={(e) =>
                  setNewTpl((s) => ({ ...s, accountType: e.target.value }))
                }
                className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              >
                {(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const).map(
                  (k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-xs font-medium text-[#34495E]">
              {t("superAdmin.chartColParent")}
              <input
                value={newTpl.parentCode}
                onChange={(e) =>
                  setNewTpl((s) => ({ ...s, parentCode: e.target.value }))
                }
                className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                placeholder="101"
              />
            </label>
            <label className="text-xs font-medium text-[#34495E]">
              {t("superAdmin.chartColSort")}
              <input
                type="number"
                value={newTpl.sortOrder}
                onChange={(e) =>
                  setNewTpl((s) => ({
                    ...s,
                    sortOrder: Number.parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={chartTplBusy}>
                {t("superAdmin.chartSaveRow")}
              </button>
            </div>
          </form>
          {chartTplBusy && !chartTpl ? (
            <p className="text-sm text-[#7F8C8D]">{t("common.loading")}</p>
          ) : null}
          {chartTpl && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white text-xs max-h-[60vh] overflow-y-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 text-left text-gray-600 sticky top-0">
                  <tr>
                    <th className="px-2 py-2">{t("superAdmin.chartColCode")}</th>
                    <th className="px-2 py-2">{t("superAdmin.chartColNameAz")}</th>
                    <th className="px-2 py-2">{t("superAdmin.chartColNameRu")}</th>
                    <th className="px-2 py-2">{t("superAdmin.chartColNameEn")}</th>
                    <th className="px-2 py-2">{t("superAdmin.chartColType")}</th>
                    <th className="px-2 py-2">{t("superAdmin.chartColParent")}</th>
                    <th className="px-2 py-2">{t("superAdmin.chartColSort")}</th>
                    <th className="px-2 py-2">{t("superAdmin.chartColDepr")}</th>
                  </tr>
                </thead>
                <tbody>
                  {chartTpl.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-2 py-1 font-mono whitespace-nowrap">{r.code}</td>
                      <td className="px-2 py-1 max-w-[14rem] truncate" title={r.nameAz}>
                        {r.nameAz}
                      </td>
                      <td className="px-2 py-1 max-w-[14rem] truncate" title={r.nameRu}>
                        {r.nameRu}
                      </td>
                      <td className="px-2 py-1 max-w-[14rem] truncate" title={r.nameEn}>
                        {r.nameEn}
                      </td>
                      <td className="px-2 py-1">{r.accountType}</td>
                      <td className="px-2 py-1 font-mono">{r.parentCode ?? "—"}</td>
                      <td className="px-2 py-1">{r.sortOrder}</td>
                      <td className="px-2 py-1">{r.isDeprecated ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subModalOrg ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sub-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <h2 id="sub-modal-title" className="text-lg font-semibold text-gray-900">
              {t("superAdmin.orgSubModalTitle")}
            </h2>
            <p className="text-sm text-gray-600">
              {subModalOrg.name}{" "}
              <span className="font-mono text-xs">({subModalOrg.taxId})</span>
            </p>
            <label className="block text-sm">
              <span className="text-gray-700">{t("superAdmin.orgSubTier")}</span>
              <select
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                value={subTier}
                onChange={(e) => {
                  const v = e.target.value as typeof subTier;
                  setSubTier(v);
                  if (v === "ENTERPRISE" && subExpires.trim() === "") {
                    setSubExpires(addOneYearFromTodayDateInput());
                  }
                }}
              >
                <option value="STARTER">{t("superAdmin.tierSTARTER")}</option>
                <option value="BUSINESS">{t("superAdmin.tierBUSINESS")}</option>
                <option value="ENTERPRISE">{t("superAdmin.tierENTERPRISE")}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">{t("superAdmin.orgSubExpires")}</span>
              <input
                type="date"
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                value={subExpires}
                onChange={(e) => setSubExpires(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={subBlocked}
                onChange={(e) => setSubBlocked(e.target.checked)}
              />
              {t("superAdmin.orgSubBlocked")}
            </label>
            <div>
              <div className="text-sm text-gray-700 mb-2">
                {t("superAdmin.orgSubModules")}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                {t("superAdmin.orgSubModulesHint")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MODULE_SLUG_PRESETS.map((slug) => (
                  <label
                    key={slug}
                    className="flex items-center gap-2 text-sm font-mono"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(subPreset[slug])}
                      onChange={() =>
                        setSubPreset((s) => ({
                          ...s,
                          [slug]: !s[slug],
                        }))
                      }
                    />
                    {slug}
                  </label>
                ))}
              </div>
              <label className="block text-sm mt-3">
                <span className="text-gray-700">
                  {t("superAdmin.orgSubModulesExtra")}
                </span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-2 text-sm font-mono"
                  value={subExtra}
                  onChange={(e) => setSubExtra(e.target.value)}
                  placeholder="ifrs_mapping, …"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
                onClick={() => setSubModalOrg(null)}
                disabled={subSaving}
              >
                {t("superAdmin.orgSubCancel")}
              </button>
              <button
                type="button"
                className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
                disabled={subSaving}
                onClick={() => void saveSubscription()}
              >
                {t("superAdmin.orgSubSave")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {userOrgsUserId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {t("superAdmin.userOrgsModalTitle")}
                </h2>
                {userOrgsData ? (
                  <p className="text-sm text-gray-600 mt-1 font-mono">
                    {userOrgsData.email}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="text-sm text-action hover:underline shrink-0"
                onClick={() => {
                  setUserOrgsUserId(null);
                  setUserOrgsData(null);
                }}
              >
                {t("superAdmin.userOrgsClose")}
              </button>
            </div>
            {userOrgsLoading ? (
              <p className="text-sm text-gray-500">{t("common.loading")}</p>
            ) : userOrgsData && userOrgsData.items.length === 0 ? (
              <p className="text-sm text-gray-600">
                {t("superAdmin.userOrgsEmpty")}
              </p>
            ) : userOrgsData ? (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
                    <tr>
                      <th className="px-2 py-2">
                        {t("superAdmin.userOrgsColCompany")}
                      </th>
                      <th className="px-2 py-2">{t("superAdmin.userOrgsColVoen")}</th>
                      <th className="px-2 py-2">{t("superAdmin.userOrgsColRole")}</th>
                      <th className="px-2 py-2">{t("superAdmin.userOrgsColTier")}</th>
                      <th className="px-2 py-2">
                        {t("superAdmin.userOrgsColExpires")}
                      </th>
                      <th className="px-2 py-2">
                        {t("superAdmin.userOrgsColModules")}
                      </th>
                      <th className="px-2 py-2">
                        {t("superAdmin.userOrgsColTrial")}
                      </th>
                      <th className="px-2 py-2">
                        {t("superAdmin.userOrgsColBlocked")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {userOrgsData.items.map((row) => (
                      <tr key={row.organizationId} className="border-t border-gray-100">
                        <td className="px-2 py-2">{row.organizationName}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.taxId}</td>
                        <td className="px-2 py-2">{roleLabel(row.role, t)}</td>
                        <td className="px-2 py-2">
                          {row.subscription
                            ? tierLabel(row.subscription.tier, t)
                            : "—"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-600">
                          {fmtExpires(row.subscription?.expiresAt)}
                        </td>
                        <td className="px-2 py-2 text-xs max-w-[180px] break-all">
                          {fmtModules(row.subscription?.activeModules)}
                        </td>
                        <td className="px-2 py-2">
                          {row.subscription?.isTrial
                            ? t("common.yes")
                            : t("common.no")}
                        </td>
                        <td className="px-2 py-2">
                          {row.subscription?.isBlocked
                            ? t("common.yes")
                            : t("common.no")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
