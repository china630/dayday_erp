"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  BookOpen,
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
  PackageSearch,
  PieChart,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  PanelLeftClose,
  PanelRightClose,
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  Upload,
  UserPlus,
  Users2,
  Wallet,
} from "lucide-react";
import type { AuthUser } from "../../lib/auth-context";

type SidebarLayout = {
  /** Collapsed rail только на lg+; на мобильном выезде — всегда полная ширина. */
  layoutCollapsed: boolean;
  openFlyoutKey: string | null;
  setOpenFlyoutKey: (k: string | null) => void;
};

const SidebarLayoutContext = createContext<SidebarLayout | null>(null);

function useSidebarLayout(): SidebarLayout {
  const v = useContext(SidebarLayoutContext);
  if (!v) {
    throw new Error("useSidebarLayout: missing provider");
  }
  return v;
}

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

function SidebarLogo({ layoutCollapsed }: { layoutCollapsed: boolean }) {
  return (
    <div
      className={[
        "flex items-center gap-3",
        layoutCollapsed ? "lg:justify-center lg:gap-0" : "",
      ].join(" ")}
    >
      <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 border border-primary flex items-center justify-center">
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
      <div className={["leading-tight", layoutCollapsed ? "lg:hidden" : ""].join(" ")}>
        <div className="text-[15px] font-semibold text-gray-900">DayDay ERP</div>
        <div className="text-[12px] text-gray-500">Budget & accounting</div>
      </div>
    </div>
  );
}

function CollapsibleNavSection({
  sectionKey,
  title,
  icon: Icon,
  sectionActive,
  sectionHeaderHighlighted,
  children,
}: {
  sectionKey: string;
  title: string;
  icon: LucideIcon;
  sectionActive: boolean;
  sectionHeaderHighlighted?: boolean;
  children: React.ReactNode;
}) {
  const { layoutCollapsed, openFlyoutKey, setOpenFlyoutKey } = useSidebarLayout();
  const [open, setOpen] = useState(sectionActive);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerOn = sectionHeaderHighlighted ?? sectionActive;
  const flyoutOpen = openFlyoutKey === sectionKey;

  useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  useEffect(() => {
    if (!layoutCollapsed || !flyoutOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpenFlyoutKey(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [layoutCollapsed, flyoutOpen, setOpenFlyoutKey]);

  const expanded = layoutCollapsed ? flyoutOpen : open;

  return (
    <div className="relative flex flex-col gap-0" ref={rootRef}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={title}
        onClick={() => {
          if (layoutCollapsed) {
            setOpenFlyoutKey(flyoutOpen ? null : sectionKey);
          } else {
            setOpen((v) => !v);
          }
        }}
        className={[
          "flex w-full items-center gap-2 px-3 py-2 rounded-lg border transition",
          layoutCollapsed ? "lg:justify-center lg:px-2" : "",
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
        <span
          className={[
            "text-sm font-semibold flex-1 text-left",
            layoutCollapsed ? "lg:sr-only" : "",
          ].join(" ")}
        >
          {title}
        </span>
        {layoutCollapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 lg:hidden" aria-hidden />
        ) : expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        )}
      </button>
      {layoutCollapsed && flyoutOpen ? (
        <div className="absolute left-full top-0 z-[60] ml-1 hidden min-w-[13rem] flex-col gap-0.5 rounded-lg border border-[#D5DADF] bg-white p-2 shadow-lg lg:flex">
          {children}
        </div>
      ) : null}
      {!layoutCollapsed && open ? (
        <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l-2 border-gray-200 pl-4">{children}</div>
      ) : null}
      {layoutCollapsed ? (
        <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l-2 border-gray-200 pl-4 lg:hidden">
          {open ? children : null}
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
  onNavClick?: () => void;
}) {
  const { t } = useTranslation();
  const { layoutCollapsed, setOpenFlyoutKey } = useSidebarLayout();
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      title={
        props.locked
          ? t("subscription.navLockedTooltip")
          : layoutCollapsed
            ? props.label
            : undefined
      }
      onClick={() => {
        if (layoutCollapsed) setOpenFlyoutKey(null);
        props.onNavClick?.();
      }}
      className={[
        "flex items-center rounded-lg border group",
        props.nested ? "gap-2 px-2 py-1.5 text-sm" : "gap-3 px-3 py-2",
        layoutCollapsed && !props.nested ? "lg:justify-center lg:px-2 lg:gap-0" : "",
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
      <span
        className={[
          "min-w-0 flex-1 text-sm font-medium",
          layoutCollapsed && !props.nested ? "lg:sr-only" : "",
        ].join(" ")}
      >
        {props.label}
      </span>
      {props.locked ? (
        <LockGlyph
          className={[
            "h-4 w-4 shrink-0 text-amber-600",
            layoutCollapsed && !props.nested ? "lg:sr-only" : "",
          ].join(" ")}
          aria-hidden
        />
      ) : null}
    </Link>
  );
}

function SideNavSubItem(props: {
  href: string;
  label: string;
  isActive: boolean;
  icon?: LucideIcon;
  onNavClick?: () => void;
}) {
  const { layoutCollapsed, setOpenFlyoutKey } = useSidebarLayout();
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      title={layoutCollapsed ? props.label : undefined}
      onClick={() => {
        if (layoutCollapsed) setOpenFlyoutKey(null);
        props.onNavClick?.();
      }}
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

export type MainNavSections = {
  bankCashActive: boolean;
  salesActive: boolean;
  purchasesActive: boolean;
  warehouseActive: boolean;
  payrollHrActive: boolean;
  reportsActive: boolean;
  adminActive: boolean;
  reportingHubActive: boolean;
  inventoryMainActive: boolean;
};

export function MainSidebar({
  mobileNavOpen,
  onNavClick,
  navSections,
  lockedManufacturing,
  lockedFixedAssets,
  lockedIfrsMapping,
  lockedBankingPro,
  token,
  user,
  canPostAccounting,
  canViewHoldingReports,
  sidebarCollapsed,
  onToggleSidebarCollapsed,
}: {
  mobileNavOpen: boolean;
  /** Close mobile drawer after navigation */
  onNavClick: () => void;
  navSections: MainNavSections;
  lockedManufacturing: boolean;
  lockedFixedAssets: boolean;
  lockedIfrsMapping: boolean;
  lockedBankingPro: boolean;
  token: string | null;
  user: AuthUser | null;
  canPostAccounting: boolean;
  canViewHoldingReports: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [layoutWide, setLayoutWide] = useState(false);
  const [openFlyoutKey, setOpenFlyoutKey] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setLayoutWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const layoutCollapsed = Boolean(sidebarCollapsed && layoutWide);

  const panelClass = [
    "fixed left-0 top-0 z-[50] flex h-screen w-64 flex-col border-r border-[#D5DADF] bg-white shadow-xl transition-[transform,width] duration-200 ease-out lg:z-40 lg:shadow-none",
    layoutWide && sidebarCollapsed ? "lg:w-[4.5rem]" : "lg:w-64",
    mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
  ].join(" ");

  const sidebarLayout: SidebarLayout = {
    layoutCollapsed,
    openFlyoutKey,
    setOpenFlyoutKey: setOpenFlyoutKey,
  };

  return (
    <aside id="app-main-sidebar" className={panelClass}>
      <div className={["shrink-0 p-5", layoutCollapsed ? "lg:px-2 lg:py-4" : ""].join(" ")}>
        <SidebarLogo layoutCollapsed={layoutCollapsed} />
      </div>
      <div className="mx-3 h-px shrink-0 bg-gray-200" />
      <SidebarLayoutContext.Provider value={sidebarLayout}>
        <nav
          className={[
            "dayday-sidebar-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-2 max-h-screen",
            layoutCollapsed ? "lg:px-2" : "",
          ].join(" ")}
          aria-label="Main navigation"
        >
        <SideNavItem
          href="/"
          label={t("nav.home")}
          isActive={pathname === "/"}
          icon={Home}
          onNavClick={onNavClick}
        />

        <CollapsibleNavSection
          sectionKey="treasury"
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
            onNavClick={onNavClick}
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
                onNavClick={onNavClick}
              />
              <SideNavItem
                href="/banking/cash"
                label={t("nav.kassa")}
                isActive={pathname.startsWith("/banking/cash")}
                icon={Wallet}
                nested
                onNavClick={onNavClick}
              />
            </>
          ) : null}
        </CollapsibleNavSection>

        <CollapsibleNavSection
          sectionKey="sales"
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
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/counterparties"
            label={t("nav.counterparties")}
            isActive={pathname.startsWith("/counterparties")}
            icon={Contact2}
            onNavClick={onNavClick}
          />
        </CollapsibleNavSection>

        <SideNavItem
          href="/inventory?modal=purchase"
          label={t("nav.sectionPurchases")}
          isActive={navSections.purchasesActive}
          icon={ShoppingBag}
          onNavClick={onNavClick}
        />

        <CollapsibleNavSection
          sectionKey="warehouse"
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
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/products"
            label={t("nav.products")}
            isActive={pathname.startsWith("/products")}
            icon={Boxes}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/inventory/transfer"
            label={t("inventory.transferNav")}
            isActive={pathname.startsWith("/inventory/transfer")}
            icon={ArrowLeftRight}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/inventory/adjustments"
            label={t("inventory.adjustNav")}
            isActive={pathname.startsWith("/inventory/adjustments")}
            icon={SlidersHorizontal}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/inventory/physical"
            label={t("inventory.physicalNav")}
            isActive={pathname.startsWith("/inventory/physical")}
            icon={PackageSearch}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/inventory/audits"
            label={t("nav.inventoryAudits")}
            isActive={pathname.startsWith("/inventory/audit")}
            icon={ClipboardList}
            onNavClick={onNavClick}
          />
          <SideNavItem
            href="/manufacturing"
            label={t("nav.manufacturing")}
            isActive={pathname.startsWith("/manufacturing")}
            locked={lockedManufacturing}
            icon={Factory}
            nested
            onNavClick={onNavClick}
          />
        </CollapsibleNavSection>

        <CollapsibleNavSection
          sectionKey="payrollHr"
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
            onNavClick={onNavClick}
          />
          <SideNavItem
            href="/hr/positions"
            label={t("nav.hrStaffingUnits")}
            isActive={pathname.startsWith("/hr/positions")}
            icon={Briefcase}
            nested
            onNavClick={onNavClick}
          />
          <SideNavItem
            href="/hr/structure"
            label={t("nav.hrStructure")}
            isActive={pathname.startsWith("/hr/structure")}
            icon={Network}
            nested
            onNavClick={onNavClick}
          />
          <SideNavItem
            href="/hr/timesheet"
            label={t("nav.hrTimesheet")}
            isActive={pathname.startsWith("/hr/timesheet")}
            icon={CalendarCheck}
            nested
            onNavClick={onNavClick}
          />
          <SideNavItem
            href="/payroll"
            label={t("nav.payroll")}
            isActive={pathname.startsWith("/payroll")}
            icon={Banknote}
            nested
            onNavClick={onNavClick}
          />
          <SideNavItem
            href="/hr/analytics"
            label={t("nav.hrInfographics")}
            isActive={pathname.startsWith("/hr/analytics")}
            icon={PieChart}
            nested
            onNavClick={onNavClick}
          />
        </CollapsibleNavSection>

        <CollapsibleNavSection
          sectionKey="reports"
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
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/reporting/receivables"
            label={t("nav.receivables")}
            isActive={pathname.startsWith("/reporting/receivables")}
            icon={ArrowUpRight}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/reporting/reconciliation"
            label={t("nav.reconciliation")}
            isActive={pathname.startsWith("/reporting/reconciliation")}
            icon={FileCheck2}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/reporting/aging"
            label={t("nav.aging")}
            isActive={pathname.startsWith("/reporting/aging")}
            icon={TrendingDown}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/reporting/tax-export"
            label={t("reporting.taxExportLink")}
            isActive={pathname.startsWith("/reporting/tax-export")}
            icon={Gavel}
            onNavClick={onNavClick}
          />
          <SideNavSubItem
            href="/reports/cash-flow"
            label={t("nav.cashFlowDirect")}
            isActive={pathname.startsWith("/reports/cash-flow")}
            icon={Coins}
            onNavClick={onNavClick}
          />
          {canViewHoldingReports ? (
            <SideNavSubItem
              href="/reporting/holding"
              label={t("nav.holdingConsolidated")}
              isActive={pathname.startsWith("/reporting/holding")}
              icon={Building2}
              onNavClick={onNavClick}
            />
          ) : null}
        </CollapsibleNavSection>

        <SideNavItem
          href="/fixed-assets"
          label={t("nav.sectionFixedAssets")}
          isActive={pathname.startsWith("/fixed-assets")}
          locked={lockedFixedAssets}
          icon={Building2}
          onNavClick={onNavClick}
        />

        {(token || user?.isSuperAdmin) && (
          <CollapsibleNavSection
            sectionKey="admin"
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
                onNavClick={onNavClick}
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
                      onNavClick={onNavClick}
                    />
                    <SideNavItem
                      href="/settings/organization"
                      label={t("nav.orgCompany")}
                      isActive={pathname.startsWith("/settings/organization")}
                      icon={Briefcase}
                      nested
                      onNavClick={onNavClick}
                    />
                    <SideNavItem
                      href="/settings/audit"
                      label={t("nav.settingsAudit")}
                      isActive={pathname.startsWith("/settings/audit")}
                      icon={History}
                      nested
                      onNavClick={onNavClick}
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
                      onNavClick={onNavClick}
                    />
                    <SideNavItem
                      href="/admin/payment-history"
                      label={t("nav.paymentHistory")}
                      isActive={pathname.startsWith("/admin/payment-history")}
                      icon={ScrollText}
                      nested
                      onNavClick={onNavClick}
                    />
                    <SideNavItem
                      href="/admin/audit-log"
                      label={t("nav.securityAuditLog")}
                      isActive={pathname.startsWith("/admin/audit-log")}
                      icon={Shield}
                      nested
                      onNavClick={onNavClick}
                    />
                  </>
                ) : null}
                <SideNavItem
                  href="/settings/chart"
                  label={t("nav.settingsChart")}
                  isActive={pathname.startsWith("/settings/chart")}
                  icon={BookOpen}
                  nested
                  onNavClick={onNavClick}
                />
                <SideNavItem
                  href="/settings/mapping"
                  label={t("nav.settingsMapping")}
                  isActive={pathname.startsWith("/settings/mapping")}
                  locked={lockedIfrsMapping}
                  icon={Link2}
                  nested
                  onNavClick={onNavClick}
                />
                <SideNavSubItem
                  href="/settings/finance/ifrs-mapping"
                  label={t("nav.settingsIfrsRules", {
                    defaultValue: "IFRS Rules",
                  })}
                  isActive={pathname.startsWith("/settings/finance/ifrs-mapping")}
                  icon={Link2}
                  onNavClick={onNavClick}
                />
                <SideNavItem
                  href="/settings/migration"
                  label={t("nav.settingsMigration")}
                  isActive={pathname.startsWith("/settings/migration")}
                  icon={Upload}
                  nested
                  onNavClick={onNavClick}
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
                onNavClick={onNavClick}
              />
            ) : null}
          </CollapsibleNavSection>
        )}
        </nav>
        <div className="mt-auto hidden shrink-0 border-t border-gray-200 p-2 lg:block">
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-lg border border-transparent p-2 text-gray-600 transition hover:border-gray-200 hover:bg-white/70"
            onClick={onToggleSidebarCollapsed}
            aria-label={
              sidebarCollapsed
                ? t("nav.sidebarExpandAria", { defaultValue: "Expand sidebar" })
                : t("nav.sidebarCollapseAria", { defaultValue: "Collapse sidebar" })
            }
          >
            {sidebarCollapsed ? (
              <PanelRightClose className="h-5 w-5 shrink-0" aria-hidden />
            ) : (
              <PanelLeftClose className="h-5 w-5 shrink-0" aria-hidden />
            )}
          </button>
        </div>
      </SidebarLayoutContext.Provider>
    </aside>
  );
}
