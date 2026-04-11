"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DashboardWidgets } from "./dashboard-widgets";
import { useAuth, type AuthUser } from "../lib/auth-context";

function greetingName(user: AuthUser): string {
  const full = user.fullName?.trim();
  if (full) return full;
  const joined = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  return user.email ?? "";
}

export default function Home() {
  const { t } = useTranslation();
  const { token, ready, user } = useAuth();

  const heading = useMemo(() => {
    if (!token || !user) return t("appTitle");
    return t("home.welcomeGreeting", { name: greetingName(user) });
  }, [t, token, user]);

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-[#34495E]">
          {heading}
        </h1>
      </div>

      {!ready ? null : !token ? (
        <div className="rounded-[2px] border border-[#D5DADF] bg-white p-6 shadow-sm">
          <p className="mb-4 text-[13px] text-[#7F8C8D]">{t("home.loginPrompt")}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex h-8 items-center justify-center rounded-[2px] bg-[#2980B9] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#2471A3]"
            >
              {t("nav.login")}
            </Link>
            <Link
              href="/register"
              className="inline-flex h-8 items-center justify-center rounded-[2px] border border-[#D5DADF] bg-white px-4 text-[13px] font-medium text-[#34495E] shadow-sm transition hover:bg-[#F4F5F7]"
            >
              {t("nav.register")}
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <DashboardWidgets />
        </div>
      )}
    </div>
  );
}
