"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "./api-client";
import { useAuth } from "./auth-context";

export type LedgerPeriodLockContextValue = {
  /** `YYYY-MM-DD` границы закрытого периода (включительно); `null` — нет блокировки. */
  lockedPeriodUntil: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const LedgerPeriodLockContext = createContext<LedgerPeriodLockContextValue | null>(null);

export function LedgerPeriodLockProvider({ children }: { children: ReactNode }) {
  const { token, organizationId } = useAuth();
  const [lockedPeriodUntil, setLockedPeriodUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || !organizationId) {
      setLockedPeriodUntil(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/organization/settings");
      if (!res.ok) {
        setLockedPeriodUntil(null);
        return;
      }
      const o = (await res.json()) as {
        settings?: { ledger?: { lockedPeriodUntil?: string | null } };
      };
      const raw = o.settings?.ledger?.lockedPeriodUntil;
      const s = typeof raw === "string" ? raw.trim().slice(0, 10) : "";
      setLockedPeriodUntil(s.length >= 10 ? s : null);
    } catch {
      setLockedPeriodUntil(null);
    } finally {
      setLoading(false);
    }
  }, [token, organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      lockedPeriodUntil,
      loading,
      refresh,
    }),
    [lockedPeriodUntil, loading, refresh],
  );

  return (
    <LedgerPeriodLockContext.Provider value={value}>{children}</LedgerPeriodLockContext.Provider>
  );
}

export function useLedgerPeriodLock(): LedgerPeriodLockContextValue {
  const ctx = useContext(LedgerPeriodLockContext);
  if (!ctx) {
    return {
      lockedPeriodUntil: null,
      loading: false,
      refresh: async () => {},
    };
  }
  return ctx;
}
