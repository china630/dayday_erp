"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
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
  ShoppingCart,
  SlidersHorizontal,
  TrendingDown,
  Upload,
  UserPlus,
  Users2,
  Wallet,
} from "lucide-react";
import type { AuthUser } from "../../lib/auth-context";

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
        <div className="text-[15px] font-semibold text-gray-900">DayDay ERP</div>
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
  sectionActive: boolean;
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
  onNavClick?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      title={props.locked ? t("subscription.navLockedTooltip") : undefined}
      onClick={() => props.onNavClick?.()}
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
  onNavClick?: () => void;
}) {
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      onClick={() => props.onNavClick?.()}
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
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const panelClass = [
    "fixed left-0 top-0 z-[50] flex h-screen w-64 flex-col border-r border-[#D5DADF] bg-white shadow-xl transition-transform duration-200 ease-out lg:z-40 lg:shadow-none",
    mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
  ].join(" ");

  return (
    <aside id="app-main-sidebar" className={panelClass}>
      <div className="shrink-0 p-5">
        <SidebarLogo />
      </div>
      <div className="mx-3 h-px shrink-0 bg-gray-200" />
      <nav
        className="dayday-sidebar-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-2 max-h-screen"
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
          href="/inventory/purchase"
          label={t("nav.sectionPurchases")}
          isActive={navSections.purchasesActive}
          icon={ShoppingBag}
          onNavClick={onNavClick}
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
    </aside>
  );
}
