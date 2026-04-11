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

export type LedgerType = "NAS" | "IFRS";

const STORAGE_KEY = "dayday-ledger-type";

function readStored(): LedgerType {
  if (typeof window === "undefined") return "NAS";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "IFRS" ? "IFRS" : "NAS";
}

type LedgerContextValue = {
  ledgerType: LedgerType;
  setLedgerType: (v: LedgerType) => void;
  ready: boolean;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [ledgerType, setLedgerTypeState] = useState<LedgerType>("NAS");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLedgerTypeState(readStored());
    setReady(true);
  }, []);

  const setLedgerType = useCallback((v: LedgerType) => {
    setLedgerTypeState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ ledgerType, setLedgerType, ready }),
    [ledgerType, setLedgerType, ready],
  );

  return (
    <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
  );
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) {
    throw new Error("useLedger must be used within LedgerProvider");
  }
  return ctx;
}

/** Query string for API (?ledgerType=NAS|IFRS) */
export function ledgerQueryParam(ledgerType: LedgerType): string {
  return `ledgerType=${encodeURIComponent(ledgerType)}`;
}
