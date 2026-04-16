"use client";

import { useMemo } from "react";
import { useAuth } from "./auth-context";

/**
 * Эффективные права для UI: флаги сессии + супер-админ.
 * Согласовано с assertMayPostManualJournal / assertMayPostAccounting на API.
 */
export function useOrgPermissions() {
  const { user, access } = useAuth();
  return useMemo(() => {
    const superAdmin = Boolean(user?.isSuperAdmin);
    return {
      orgRole: user?.role ?? null,
      canPostAccounting: superAdmin || access.canPostAccounting,
      canViewHoldingReports: superAdmin || access.canViewHoldingReports,
      isSuperAdmin: superAdmin,
    };
  }, [user?.isSuperAdmin, user?.role, access]);
}
