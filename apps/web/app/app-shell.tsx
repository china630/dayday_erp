"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { useOrgPermissions } from "../lib/use-org-permissions";
import type { OrgSummary } from "../lib/auth-context";
import { useSubscription } from "../lib/subscription-context";
import { apiFetch } from "../lib/api-client";
import { HeaderSubscriptionStrip } from "../components/header-subscription-strip";
import { TrialBanner } from "../components/trial-banner";
import { useLedger } from "../lib/ledger-context";
import { LanguageSwitcher } from "./language-switcher";
import { ApiHealthIndicator } from "../components/api-health-indicator";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Boxes,
  Briefcase,
  Building2,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Coins,
  Contact2,
  CreditCard,
  Factory,
  FileCheck2,
  FileText,
  Gavel,
  History,
  Home,
  Landmark,
  Link2,
  Network,
  Package,
  PieChart,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  UserPlus,
  Users2,
  Wallet,
  Zap,
} from "lucide-react";

const quickActionItemClass =
  "block px-3 py-2 text-sm text-gray-700 hover:bg-action/10 hover:text-primary rounded-md mx-1";

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function QuickActionsMenuItems({
  onNavigate,
  manufacturingLocked,
  canPostAccounting,
}: {
  onNavigate: () => void;
  manufacturingLocked: boolean;
  canPostAccounting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Link
        href="/invoices"
        className={quickActionItemClass}
        role="menuitem"
        onClick={onNavigate}
      >
        {t("quickActions.invoice")}
      </Link>
      {canPostAccounting ? (
        <Link
          href="/expenses/quick"
          className={quickActionItemClass}
          role="menuitem"
          onClick={onNavigate}
        >
          {t("quickActions.expense")}
        </Link>
      ) : null}
      <Link
        href="/employees/new"
        className={quickActionItemClass}
        role="menuitem"
        onClick={onNavigate}
      >
        {t("quickActions.employee")}
      </Link>
      {manufacturingLocked ? (
        <span
          className={`${quickActionItemClass} opacity-50 cursor-not-allowed pointer-events-none flex items-center gap-2`}
          role="menuitem"
          title={t("subscription.navLockedTooltip")}
        >
          <LockGlyph className="h-4 w-4 shrink-0 text-amber-600" />
          {t("quickActions.release")}
        </span>
      ) : canPostAccounting ? (
        <Link
          href="/manufacturing/release"
          className={quickActionItemClass}
          role="menuitem"
          onClick={onNavigate}
        >
          {t("quickActions.release")}
        </Link>
      ) : null}
    </>
  );
}

function QuickActionsDropdown({
  manufacturingLocked,
  canPostAccounting,
}: {
  manufacturingLocked: boolean;
  canPostAccounting: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div className="relative hidden md:block" ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("nav.quickActionsAria")}
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-semibold text-primary hover:border-action/40 hover:bg-action/10 transition"
      >
        +
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-56 origin-top-right rounded-xl border border-gray-200 bg-white py-1 shadow-lg z-[100]"
          role="menu"
        >
          <QuickActionsMenuItems
            onNavigate={() => setOpen(false)}
            manufacturingLocked={manufacturingLocked}
            canPostAccounting={canPostAccounting}
          />
        </div>
      )}
    </div>
  );
}

/** Плавающая кнопка быстрых действий на экранах &lt;768px (см. ТЗ). */
function QuickActionsMobileFab({
  manufacturingLocked,
  canPostAccounting,
}: {
  manufacturingLocked: boolean;
  canPostAccounting: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div className="md:hidden fixed bottom-5 right-5 z-50" ref={wrapRef}>
      {open && (
        <div
          className="absolute bottom-16 right-0 w-56 rounded-xl border border-gray-200 bg-white shadow-xl py-1 mb-1"
          role="menu"
        >
          <QuickActionsMenuItems
            onNavigate={() => setOpen(false)}
            manufacturingLocked={manufacturingLocked}
            canPostAccounting={canPostAccounting}
          />
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("nav.quickActionsAria")}
        onClick={() => setOpen((v) => !v)}
        className="h-14 w-14 flex items-center justify-center rounded-full bg-action text-white text-2xl font-semibold shadow-lg border border-action-hover hover:bg-action-hover transition"
      >
        +
      </button>
    </div>
  );
}

function SidebarLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary flex items-center justify-center">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 7.5C4 6.11929 5.11929 5 6.5 5H20V19.5C20 20.8807 18.8807 22 17.5 22H6.5C5.11929 22 4 20.8807 4 19.5V7.5Z"
            stroke="#34495E"
            strokeWidth="1.5"
          />
          <path
            d="M7 9H17"
            stroke="#34495E"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M7 12H17"
            stroke="#34495E"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M7 15H13"
            stroke="#34495E"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold text-gray-900">
          DayDay ERP
        </div>
        <div className="text-[12px] text-gray-500">Budget & accounting</div>
      </div>
    </div>
  );
}

function CollapsibleNavSection({
  title,
  icon: Icon,
  sectionActive,
  sectionHeaderHighlighted,
  children,
}: {
  title: string;
  icon: LucideIcon;
  /** Раскрыть секцию и держать открытой при совпадении маршрута */
  sectionActive: boolean;
  /** Подсветка заголовка секции (если не задано — как sectionActive) */
  sectionHeaderHighlighted?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(sectionActive);
  const headerOn = sectionHeaderHighlighted ?? sectionActive;
  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  return (
    <div className="flex flex-col gap-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex w-full items-center gap-2 px-3 py-2 rounded-lg border transition",
          headerOn
            ? "bg-white border-primary text-gray-900 shadow-md"
            : "bg-transparent border-transparent text-gray-600 hover:border-gray-200 hover:bg-white/70",
        ].join(" ")}
      >
        <Icon
          size={16}
          strokeWidth={2}
          className={[
            "shrink-0",
            headerOn ? "text-[#2980B9]" : "text-[#7F8C8D]",
          ].join(" ")}
          aria-hidden
        />
        <span className="text-sm font-semibold flex-1 text-left">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        )}
      </button>
      {open ? (
        <div className="ml-2 mt-1 pl-4 border-l-2 border-gray-200 flex flex-col gap-0.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SideNavItem(props: {
  href: string;
  label: string;
  isActive: boolean;
  locked?: boolean;
  icon?: LucideIcon;
  nested?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      title={props.locked ? t("subscription.navLockedTooltip") : undefined}
      className={[
        "flex items-center rounded-lg border group",
        props.nested ? "gap-2 px-2 py-1.5 text-sm" : "gap-3 px-3 py-2",
        props.isActive
          ? "bg-white border-primary text-gray-900 shadow-md"
          : "bg-transparent border-transparent text-gray-600 hover:border-gray-200 hover:bg-white/70",
        props.locked ? "opacity-90" : "",
      ].join(" ")}
    >
      {Icon ? (
        <Icon
          size={16}
          strokeWidth={2}
          className={[
            "shrink-0",
            props.isActive ? "text-[#2980B9]" : "text-[#7F8C8D]",
          ].join(" ")}
          aria-hidden
        />
      ) : (
        <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
      )}
      <span className="text-sm font-medium flex-1 min-w-0">{props.label}</span>
      {props.locked ? (
        <LockGlyph className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      ) : null}
    </Link>
  );
}

function SideNavSubItem(props: {
  href: string;
  label: string;
  isActive: boolean;
  icon?: LucideIcon;
}) {
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      className={[
        "flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md border text-sm ml-0.5",
        props.isActive
          ? "bg-white border-primary/80 text-gray-900 shadow-sm"
          : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-white/60",
      ].join(" ")}
    >
      {Icon ? (
        <Icon
          size={16}
          strokeWidth={2}
          className={[
            "shrink-0",
            props.isActive ? "text-[#2980B9]" : "text-[#7F8C8D]",
          ].join(" ")}
          aria-hidden
        />
      ) : (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/70 shrink-0" />
      )}
      <span className="font-medium">{props.label}</span>
    </Link>
  );
}

function OrgSwitcher() {
  const { t } = useTranslation();
  const { user, organizations, switchOrganization, ready, token } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<{
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
  } | null>(null);
  const [treeErr, setTreeErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    setTreeErr(null);
    void apiFetch("/api/organizations/tree")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setTreeErr(`${res.status}`);
          return;
        }
        setTree((await res.json()) as typeof tree);
      })
      .catch(() => setTreeErr("load"))
      .finally(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  if (!ready || !token || !user) return null;

  const current = organizations.find((o) => o.id === user.organizationId);

  if (organizations.length <= 1) {
    return current ? (
      <span
        className="hidden sm:inline text-sm font-medium text-primary truncate max-w-[220px]"
        title={current.name}
      >
        {current.name}
      </span>
    ) : null;
  }

  return (
    <div className="relative hidden sm:block" ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("orgSwitcher.aria")}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 max-w-[240px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-primary hover:border-action/40 hover:bg-action/10 transition text-left"
      >
        <span className="truncate">{current?.name ?? "—"}</span>
        <span className="text-gray-400 shrink-0" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul
          className="absolute left-0 mt-1 w-72 max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-50"
          role="listbox"
        >
          {treeErr ? (
            <li className="px-3 py-2 text-xs text-slate-500">
              {t("common.loadErr")}: {treeErr}
            </li>
          ) : null}

          {tree?.holdings?.length ? (
            <li className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("orgSwitcher.holdingSection")}
            </li>
          ) : null}

          {(tree?.holdings ?? []).map((h) => (
            <li key={h.holdingId} className="pt-1">
              <Link
                href={`/holding?id=${encodeURIComponent(h.holdingId)}`}
                className="block px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-action/10"
                onClick={() => setOpen(false)}
              >
                {h.holdingName}
                <span className="ml-2 text-xs font-medium text-slate-500">
                  {h.baseCurrency}
                </span>
              </Link>
              <ul className="pb-1">
                {h.organizations.map((o) => (
                  <li key={o.id} role="option" aria-selected={o.id === user.organizationId}>
                    <button
                      type="button"
                      className="w-full text-left pl-6 pr-3 py-2 text-sm hover:bg-action/10 flex flex-col gap-0.5"
                      onClick={() => {
                        if (o.id === user.organizationId) {
                          setOpen(false);
                          return;
                        }
                        void switchOrganization(o.id)
                          .then(() => setOpen(false))
                          .catch(() => {
                            /* toast optional */
                          });
                      }}
                    >
                      <span className="font-medium text-gray-900 truncate">{o.name}</span>
                      <span className="text-xs text-gray-500">
                        VÖEN {o.taxId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}

          {tree?.freeOrganizations?.length ? (
            <>
              <li className="border-t border-gray-100 mt-1" />
              <li className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {t("orgSwitcher.freeCompanies")}
              </li>
              {tree.freeOrganizations.map((o) => (
                <li key={o.id} role="option" aria-selected={o.id === user.organizationId}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-action/10 flex flex-col gap-0.5"
                    onClick={() => {
                      if (o.id === user.organizationId) {
                        setOpen(false);
                        return;
                      }
                      void switchOrganization(o.id)
                        .then(() => setOpen(false))
                        .catch(() => {
                          /* toast optional */
                        });
                    }}
                  >
                    <span className="font-medium text-gray-900 truncate">{o.name}</span>
                    <span className="text-xs text-gray-500">VÖEN {o.taxId}</span>
                  </button>
                </li>
              ))}
            </>
          ) : null}

          <li className="border-t border-gray-100 mt-1 pt-1">
            <Link
              href="/companies"
              className="block px-3 py-2 text-sm text-action hover:bg-action/10"
              onClick={() => setOpen(false)}
            >
              {t("orgSwitcher.manageCompanies")}
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

function LedgerToggle() {
  const { t } = useTranslation();
  const { ledgerType, setLedgerType, ready } = useLedger();

  if (!ready) {
    return (
      <span className="text-xs text-gray-400 tabular-nums">…</span>
    );
  }

  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 bg-slate-50 p-0.5"
      role="group"
      aria-label={t("ledger.toggleAria")}
    >
      <button
        type="button"
        onClick={() => setLedgerType("NAS")}
        className={[
          "px-2.5 py-1.5 text-xs font-semibold rounded-md transition",
          ledgerType === "NAS"
            ? "bg-white text-primary shadow-sm border border-action/20"
            : "text-gray-600 hover:text-gray-900",
        ].join(" ")}
      >
        {t("ledger.nas")}
      </button>
      <button
        type="button"
        onClick={() => setLedgerType("IFRS")}
        className={[
          "px-2.5 py-1.5 text-xs font-semibold rounded-md transition",
          ledgerType === "IFRS"
            ? "bg-white text-primary shadow-sm border border-action/20"
            : "text-gray-600 hover:text-gray-900",
        ].join(" ")}
      >
        {t("ledger.ifrs")}
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const { token, user, ready, logout } = useAuth();
  const { canPostAccounting, canViewHoldingReports } = useOrgPermissions();
  const { ready: subReady, effectiveSnapshot: snapshot } = useSubscription();

  /** Без организации доступны только «Мои компании» (и Super-Admin для супер-админа). */
  useEffect(() => {
    if (!ready || !token || !user) return;
    if (user.organizationId) return;
    if (pathname === "/companies" || pathname.startsWith("/companies/")) return;
    if (user.isSuperAdmin && pathname.startsWith("/super-admin")) return;
    router.replace("/companies");
  }, [ready, token, user, pathname, router]);

  /**
   * Замки только после загрузки снимка подписки. Пока snapshot === null,
   * пункты не блокируем — иначе при Enterprise всё «закрыто» до ответа /subscription/me.
   * ENTERPRISE: без замков по тарифу; остальные — по modules.* из API.
   */
  const lockedManufacturing = useMemo(() => {
    if (!token || !subReady) return false;
    if (!snapshot) return false;
    if (String(snapshot.tier).toUpperCase() === "ENTERPRISE") return false;
    return !snapshot.modules.manufacturing;
  }, [token, subReady, snapshot]);
  const lockedFixedAssets = useMemo(() => {
    if (!token || !subReady) return false;
    if (!snapshot) return false;
    if (String(snapshot.tier).toUpperCase() === "ENTERPRISE") return false;
    return !snapshot.modules.fixedAssets;
  }, [token, subReady, snapshot]);
  const lockedIfrsMapping = useMemo(() => {
    if (!token || !subReady) return false;
    if (!snapshot) return false;
    if (String(snapshot.tier).toUpperCase() === "ENTERPRISE") return false;
    return !snapshot.modules.ifrsMapping;
  }, [token, subReady, snapshot]);
  const lockedBankingPro = useMemo(() => {
    if (!token || !subReady) return false;
    if (!snapshot) return false;
    if (String(snapshot.tier).toUpperCase() === "ENTERPRISE") return false;
    return !snapshot.modules.bankingPro;
  }, [token, subReady, snapshot]);

  const navSections = useMemo(() => {
    const bankCashActive =
      pathname.startsWith("/banking") || pathname.startsWith("/expenses");
    const salesActive =
      pathname.startsWith("/invoices") ||
      pathname.startsWith("/counterparties");
    const purchasesActive = pathname.startsWith("/inventory/purchase");
    const warehouseActive =
      (pathname.startsWith("/inventory") &&
        !pathname.startsWith("/inventory/purchase")) ||
      pathname.startsWith("/products") ||
      pathname.startsWith("/manufacturing");
    const payrollHrActive =
      pathname.startsWith("/employees") ||
      pathname.startsWith("/hr/") ||
      pathname.startsWith("/payroll");
    const reportsActive = pathname.startsWith("/reporting");
    const adminActive =
      pathname.startsWith("/companies") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/super-admin");
    const reportingHubActive =
      pathname === "/reporting" ||
      (pathname.startsWith("/reporting") &&
        !pathname.startsWith("/reporting/receivables") &&
        !pathname.startsWith("/reporting/reconciliation") &&
        !pathname.startsWith("/reporting/aging") &&
        !pathname.startsWith("/reporting/tax-export") &&
        !pathname.startsWith("/reporting/holding"));
    /** Только хаб остатков `/inventory`, без вложенных экранов (köçürmə, inventar və s.) */
    const inventoryMainActive = pathname === "/inventory";
    return {
      bankCashActive,
      salesActive,
      purchasesActive,
      warehouseActive,
      payrollHrActive,
      reportsActive,
      adminActive,
      reportingHubActive,
      inventoryMainActive,
    };
  }, [pathname]);

  const hideShell = useMemo(() => {
    return (
      pathname === "/login" ||
      pathname === "/register" ||
      pathname === "/register-org" ||
      pathname.startsWith("/verify/")
    );
  }, [pathname]);

  const superAdminRoute = pathname.startsWith("/super-admin");

  if (hideShell) {
    return <div className="min-h-screen">{children}</div>;
  }

  if (superAdminRoute) {
    return (
      <div className="min-h-screen bg-secondary">
        <header className="border-b border-[#D5DADF] bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <Link
            href="/"
            className="text-sm font-semibold text-action hover:opacity-90"
          >
            ← {t("nav.home")}
          </Link>
          <span className="text-xs font-bold uppercase tracking-wide text-[#34495E] bg-[#EBEDF0] px-2 py-1 rounded-[2px] border border-[#D5DADF]">
            Super Admin
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-[#7F8C8D] hover:text-[#34495E]"
          >
            {t("superAdmin.logout")}
          </button>
        </header>
        <main className="p-4 md:p-6 max-w-7xl mx-auto text-[13px]">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary">
      <div className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-white border-r border-gray-200">
        <div className="shrink-0 p-5">
          <SidebarLogo />
        </div>
        <div className="mx-3 h-px shrink-0 bg-gray-200" />
        <nav className="dayday-sidebar-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-2 max-h-screen">
            <SideNavItem
              href="/"
              label={t("nav.home")}
              isActive={pathname === "/"}
              icon={Home}
            />

            <CollapsibleNavSection
              title={t("nav.sectionTreasury")}
              icon={Landmark}
              sectionActive={navSections.bankCashActive}
            >
              <SideNavItem
                href="/banking/money"
                label={t("treasury.moneyTitle")}
                isActive={pathname.startsWith("/banking/money")}
                icon={Coins}
                nested
              />
              {canPostAccounting ? (
                <>
                  <SideNavItem
                    href="/banking"
                    label={t("nav.banking")}
                    isActive={pathname === "/banking"}
                    locked={lockedBankingPro}
                    icon={Landmark}
                    nested
                  />
                  <SideNavItem
                    href="/banking/cash"
                    label={t("nav.kassa")}
                    isActive={pathname.startsWith("/banking/cash")}
                    icon={Wallet}
                    nested
                  />
                </>
              ) : null}
            </CollapsibleNavSection>

            <CollapsibleNavSection
              title={t("nav.sectionSales")}
              icon={ShoppingCart}
              sectionActive={navSections.salesActive}
            >
              <SideNavItem
                href="/invoices"
                label={t("nav.invoices")}
                isActive={pathname.startsWith("/invoices")}
                icon={FileText}
                nested
              />
              <SideNavSubItem
                href="/counterparties"
                label={t("nav.counterparties")}
                isActive={pathname.startsWith("/counterparties")}
                icon={Contact2}
              />
            </CollapsibleNavSection>

            <SideNavItem
              href="/inventory/purchase"
              label={t("nav.sectionPurchases")}
              isActive={navSections.purchasesActive}
              icon={ShoppingBag}
            />

            <CollapsibleNavSection
              title={t("nav.sectionWarehouse")}
              icon={Package}
              sectionActive={navSections.warehouseActive}
            >
              <SideNavItem
                href="/inventory"
                label={t("nav.inventory")}
                isActive={navSections.inventoryMainActive}
                icon={Package}
                nested
              />
              <SideNavSubItem
                href="/products"
                label={t("nav.products")}
                isActive={pathname.startsWith("/products")}
                icon={Boxes}
              />
              <SideNavSubItem
                href="/inventory/transfer"
                label={t("inventory.transferNav")}
                isActive={pathname.startsWith("/inventory/transfer")}
                icon={ArrowLeftRight}
              />
              <SideNavSubItem
                href="/inventory/adjustments"
                label={t("inventory.adjustNav")}
                isActive={pathname.startsWith("/inventory/adjustments")}
                icon={SlidersHorizontal}
              />
              <SideNavSubItem
                href="/inventory/audits"
                label={t("nav.inventoryAudits")}
                isActive={pathname.startsWith("/inventory/audit")}
                icon={ClipboardList}
              />
              <SideNavItem
                href="/manufacturing"
                label={t("nav.manufacturing")}
                isActive={pathname.startsWith("/manufacturing")}
                locked={lockedManufacturing}
                icon={Factory}
                nested
              />
            </CollapsibleNavSection>

            <CollapsibleNavSection
              title={t("nav.sectionPayrollHr")}
              icon={Users2}
              sectionActive={navSections.payrollHrActive}
            >
              <SideNavItem
                href="/employees"
                label={t("nav.employees")}
                isActive={pathname.startsWith("/employees")}
                icon={Users2}
                nested
              />
              <SideNavItem
                href="/hr/positions"
                label={t("nav.hrStaffingUnits")}
                isActive={pathname.startsWith("/hr/positions")}
                icon={Briefcase}
                nested
              />
              <SideNavItem
                href="/hr/structure"
                label={t("nav.hrStructure")}
                isActive={pathname.startsWith("/hr/structure")}
                icon={Network}
                nested
              />
              <SideNavItem
                href="/hr/timesheet"
                label={t("nav.hrTimesheet")}
                isActive={pathname.startsWith("/hr/timesheet")}
                icon={CalendarCheck}
                nested
              />
              <SideNavItem
                href="/payroll"
                label={t("nav.payroll")}
                isActive={pathname.startsWith("/payroll")}
                icon={Banknote}
                nested
              />
              <SideNavItem
                href="/hr/analytics"
                label={t("nav.hrInfographics")}
                isActive={pathname.startsWith("/hr/analytics")}
                icon={PieChart}
                nested
              />
            </CollapsibleNavSection>

            <CollapsibleNavSection
              title={t("nav.sectionReports")}
              icon={BarChart3}
              sectionActive={navSections.reportsActive}
            >
              <SideNavItem
                href="/reporting"
                label={t("nav.reportingHub")}
                isActive={navSections.reportingHubActive}
                icon={PieChart}
                nested
              />
              <SideNavSubItem
                href="/reporting/receivables"
                label={t("nav.receivables")}
                isActive={pathname.startsWith("/reporting/receivables")}
                icon={ArrowUpRight}
              />
              <SideNavSubItem
                href="/reporting/reconciliation"
                label={t("nav.reconciliation")}
                isActive={pathname.startsWith("/reporting/reconciliation")}
                icon={FileCheck2}
              />
              <SideNavSubItem
                href="/reporting/aging"
                label={t("nav.aging")}
                isActive={pathname.startsWith("/reporting/aging")}
                icon={TrendingDown}
              />
              <SideNavSubItem
                href="/reporting/tax-export"
                label={t("reporting.taxExportLink")}
                isActive={pathname.startsWith("/reporting/tax-export")}
                icon={Gavel}
              />
              {canViewHoldingReports ? (
                <SideNavSubItem
                  href="/reporting/holding"
                  label={t("nav.holdingConsolidated")}
                  isActive={pathname.startsWith("/reporting/holding")}
                  icon={Building2}
                />
              ) : null}
            </CollapsibleNavSection>

            <SideNavItem
              href="/fixed-assets"
              label={t("nav.sectionFixedAssets")}
              isActive={pathname.startsWith("/fixed-assets")}
              locked={lockedFixedAssets}
              icon={Building2}
            />

            {(token || user?.isSuperAdmin) && (
              <CollapsibleNavSection
                title={t("nav.sectionAdmin")}
                icon={Settings}
                sectionActive={navSections.adminActive}
              >
                {token ? (
                  <SideNavItem
                    href="/companies"
                    label={t("nav.companies")}
                    isActive={pathname.startsWith("/companies")}
                    icon={Building2}
                    nested
                  />
                ) : null}
                {user && user.role != null && user.role !== "USER" ? (
                  <>
                    {(user.role === "OWNER" || user.role === "ADMIN") && (
                      <>
                        <SideNavItem
                          href="/settings/team"
                          label={t("nav.team")}
                          isActive={pathname.startsWith("/settings/team")}
                          icon={UserPlus}
                          nested
                        />
                        <SideNavItem
                          href="/settings/audit"
                          label={t("nav.settingsAudit")}
                          isActive={pathname.startsWith("/settings/audit")}
                          icon={History}
                          nested
                        />
                      </>
                    )}
                    {user.role === "OWNER" ? (
                      <>
                        <SideNavItem
                          href="/admin/billing"
                          label={t("nav.settingsSubscription")}
                          isActive={
                            (pathname.startsWith("/admin/billing") &&
                              !pathname.startsWith("/admin/payment-history")) ||
                            pathname.startsWith("/settings/subscription")
                          }
                          icon={CreditCard}
                          nested
                        />
                        <SideNavItem
                          href="/admin/payment-history"
                          label={t("nav.paymentHistory")}
                          isActive={pathname.startsWith("/admin/payment-history")}
                          icon={ScrollText}
                          nested
                        />
                      </>
                    ) : null}
                    <SideNavItem
                      href="/settings/mapping"
                      label={t("nav.settingsMapping")}
                      isActive={pathname.startsWith("/settings/mapping")}
                      locked={lockedIfrsMapping}
                      icon={Link2}
                      nested
                    />
                  </>
                ) : null}
                {user?.isSuperAdmin ? (
                  <SideNavItem
                    href="/super-admin"
                    label={t("nav.superAdmin")}
                    isActive={pathname.startsWith("/super-admin")}
                    icon={ShieldCheck}
                    nested
                  />
                ) : null}
              </CollapsibleNavSection>
            )}
        </nav>
      </div>

      <div className="pl-64 pt-16">
        <div className="fixed top-0 left-64 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-action/15">
          <div className="px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <ApiHealthIndicator />
              <LedgerToggle />
              {ready && token ? (
                <QuickActionsDropdown
                  manufacturingLocked={lockedManufacturing}
                  canPostAccounting={canPostAccounting}
                />
              ) : null}
              <LanguageSwitcher />
            </div>

            <div className="flex items-center gap-3 min-w-0">
              {ready && token && user && (
                <div className="hidden sm:flex items-center gap-3 min-w-0 flex-1 justify-end flex-wrap">
                  <OrgSwitcher />
                  <HeaderSubscriptionStrip />
                  <div className="text-sm text-primary truncate max-w-[180px]">
                    {user.email}
                  </div>
                </div>
              )}

              {ready && token ? (
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="px-3 py-2 rounded-lg border border-gray-200 hover:border-primary text-sm font-medium bg-white hover:bg-primary/5 transition"
                >
                  {t("nav.logout")}
                </button>
              ) : (
                <div className="flex gap-3">
                  <Link
                    href="/login"
                    className="px-3 py-2 rounded-lg border border-gray-200 hover:border-primary text-sm font-medium bg-white hover:bg-primary/5 transition"
                  >
                    {t("nav.login")}
                  </Link>
                  <Link
                    href="/register"
                    className="px-3 py-2 rounded-lg border border-gray-200 hover:border-primary text-sm font-medium bg-white hover:bg-primary/5 transition"
                  >
                    {t("nav.register")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <main className="max-w-6xl mx-auto w-full p-8">
          {ready && token ? <TrialBanner /> : null}
          {children}
        </main>
      </div>

      {ready && token ? (
        <QuickActionsMobileFab
          manufacturingLocked={lockedManufacturing}
          canPostAccounting={canPostAccounting}
        />
      ) : null}
    </div>
  );
}

