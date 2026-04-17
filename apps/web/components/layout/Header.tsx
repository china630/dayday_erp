"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { HeaderSubscriptionStrip } from "../header-subscription-strip";
import { LanguageSwitcher } from "../../app/language-switcher";
import { ApiHealthIndicator } from "../api-health-indicator";
import type { AuthUser } from "../../lib/auth-context";

export function MainHeader({
  onToggleMobileNav,
  mobileNavOpen,
  ready,
  token,
  user,
  ledgerToggle,
  quickActionsDropdown,
  orgSwitcher,
  onLogout,
}: {
  onToggleMobileNav: () => void;
  mobileNavOpen: boolean;
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  ledgerToggle: React.ReactNode;
  quickActionsDropdown: React.ReactNode;
  orgSwitcher: React.ReactNode;
  onLogout: () => void | Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <header className="fixed top-0 left-0 right-0 z-[60] border-b border-action/15 bg-white/90 backdrop-blur-md lg:left-64">
      <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#D5DADF] bg-white text-[#34495E] transition hover:border-[#2980B9]/40 hover:bg-[#2980B9]/10 lg:hidden"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            aria-controls="app-main-sidebar"
            onClick={onToggleMobileNav}
          >
            <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <ApiHealthIndicator />
          {ledgerToggle}
          {ready && token ? quickActionsDropdown : null}
          <LanguageSwitcher />
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          {ready && token && user ? (
            <div className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-3 sm:flex">
              {orgSwitcher}
              <HeaderSubscriptionStrip />
              <div className="max-w-[180px] truncate text-sm font-medium text-[#34495E]">
                {user.email}
              </div>
            </div>
          ) : null}

          {ready && token ? (
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-lg border border-[#D5DADF] bg-white px-2.5 py-2 text-[13px] font-medium text-[#34495E] transition hover:border-[#34495E] hover:bg-[#34495E]/5 sm:px-3"
            >
              {t("nav.logout")}
            </button>
          ) : (
            <div className="flex gap-2 sm:gap-3">
              <Link
                href="/login"
                className="rounded-lg border border-[#D5DADF] bg-white px-2.5 py-2 text-[13px] font-medium text-[#34495E] transition hover:border-[#34495E] hover:bg-[#34495E]/5 sm:px-3"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-[#D5DADF] bg-white px-2.5 py-2 text-[13px] font-medium text-[#34495E] transition hover:border-[#34495E] hover:bg-[#34495E]/5 sm:px-3"
              >
                {t("nav.register")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
