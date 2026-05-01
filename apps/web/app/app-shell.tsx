"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { useOrgPermissions } from "../lib/use-org-permissions";
import { useSubscription } from "../lib/subscription-context";
import { apiFetch } from "../lib/api-client";
import { TrialBanner } from "../components/trial-banner";
import { useLedger } from "../lib/ledger-context";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MainSidebar } from "../components/layout/Sidebar";
import { MainHeader } from "../components/layout/Header";

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
        href="/sales/invoices"
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
        href="/employees"
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
          href="/manufacturing/releases"
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

function OrgSwitcher({ onNavigate }: { onNavigate?: () => void }) {
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

  const pickDone = useCallback(() => {
    setOpen(false);
    onNavigate?.();
  }, [onNavigate]);

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
                onClick={pickDone}
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
                          pickDone();
                          return;
                        }
                        void switchOrganization(o.id)
                          .then(() => pickDone())
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
                        pickDone();
                        return;
                      }
                      void switchOrganization(o.id)
                        .then(() => pickDone())
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
              onClick={pickDone}
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
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-medium text-gray-600">
        {t("ledger.standardLabel")}
      </span>
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

  const billingBanner = useMemo(() => {
    const status = snapshot?.billingStatus;
    if (status === "SOFT_BLOCK") {
      return {
        tone: "soft" as const,
        text: t("billingEnforcement.softBlockBanner"),
      };
    }
    if (status === "HARD_BLOCK") {
      return {
        tone: "hard" as const,
        text: t("billingEnforcement.hardBlockBanner"),
      };
    }
    return null;
  }, [snapshot?.billingStatus, t]);

  const navSections = useMemo(() => {
    const bankCashActive =
      pathname.startsWith("/banking") || pathname.startsWith("/expenses");
    const salesActive =
      pathname.startsWith("/sales/invoices") ||
      pathname.startsWith("/sales/reconciliation");
    const purchasesActive = pathname.startsWith("/purchases");
    const manufacturingNavActive = pathname.startsWith("/manufacturing");
    const warehouseActive = pathname.startsWith("/inventory");
    const catalogCrmActive =
      pathname.startsWith("/crm") || pathname.startsWith("/catalog");
    const payrollHrActive =
      pathname.startsWith("/employees") ||
      pathname.startsWith("/hr/") ||
      pathname.startsWith("/payroll");
    const reportsActive =
      pathname.startsWith("/reporting") || pathname.startsWith("/reports");
    const adminActive =
      pathname.startsWith("/companies") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/super-admin");
    const reportingHubActive =
      !pathname.startsWith("/reports") &&
      (pathname === "/reporting" ||
        (pathname.startsWith("/reporting") &&
          !pathname.startsWith("/reporting/receivables") &&
          !pathname.startsWith("/reporting/aging") &&
          !pathname.startsWith("/reporting/tax-export") &&
          !pathname.startsWith("/reporting/holding")));
    /** Только хаб остатков `/inventory`, без вложенных экранов (köçürmə, inventar və s.) */
    const inventoryMainActive = pathname === "/inventory";
    return {
      bankCashActive,
      salesActive,
      purchasesActive,
      manufacturingNavActive,
      warehouseActive,
      catalogCrmActive,
      payrollHrActive,
      reportsActive,
      adminActive,
      reportingHubActive,
      inventoryMainActive,
    };
  }, [pathname]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("dayday_sidebar_collapsed") === "1") {
      setSidebarCollapsed(true);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("dayday_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((v) => !v), []);

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) {
      document.body.style.overflow = "";
      return;
    }
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => {
      document.body.style.overflow = mq.matches ? "hidden" : "";
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileNav();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, closeMobileNav]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onWide = () => {
      if (mq.matches) setMobileNavOpen(false);
    };
    mq.addEventListener("change", onWide);
    return () => mq.removeEventListener("change", onWide);
  }, []);

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
    <div className="min-h-screen overflow-x-hidden bg-[#EBEDF0]">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] cursor-default bg-black/40 lg:hidden"
          aria-label="Close menu"
          onClick={closeMobileNav}
        />
      ) : null}

      <MainSidebar
        mobileNavOpen={mobileNavOpen}
        onNavClick={closeMobileNav}
        navSections={navSections}
        lockedManufacturing={lockedManufacturing}
        lockedFixedAssets={lockedFixedAssets}
        lockedIfrsMapping={lockedIfrsMapping}
        lockedBankingPro={lockedBankingPro}
        token={token}
        user={user}
        canPostAccounting={canPostAccounting}
        canViewHoldingReports={canViewHoldingReports}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapsed={() => setSidebarCollapsed((v) => !v)}
      />

      <div
        className={[
          "min-w-0 pt-16 transition-[padding] duration-200 ease-out",
          sidebarCollapsed ? "lg:pl-[4.5rem]" : "lg:pl-64",
        ].join(" ")}
      >
        <MainHeader
          onToggleMobileNav={toggleMobileNav}
          mobileNavOpen={mobileNavOpen}
          ready={ready}
          token={token}
          user={user}
          ledgerToggle={<LedgerToggle />}
          quickActionsDropdown={
            ready && token ? (
              <QuickActionsDropdown
                manufacturingLocked={lockedManufacturing}
                canPostAccounting={canPostAccounting}
              />
            ) : null
          }
          orgSwitcher={<OrgSwitcher onNavigate={closeMobileNav} />}
          onLogout={() => void logout()}
        />

        <main className="app-shell-main mx-auto w-full min-w-0 max-w-screen-xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:px-8 lg:pb-8">
          {ready && token ? <TrialBanner /> : null}
          {ready && token && billingBanner ? (
            <div
              className={[
                "mb-4 rounded-[2px] border px-3 py-2 text-[13px] font-semibold",
                billingBanner.tone === "hard"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-900",
              ].join(" ")}
            >
              {billingBanner.text}
            </div>
          ) : null}
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

