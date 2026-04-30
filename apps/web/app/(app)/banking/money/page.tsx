"use client";

import Link from "next/link";
import { Landmark, Wallet } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../../lib/design-system";
import { ledgerQueryParam, useLedger } from "../../../../lib/ledger-context";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { PageHeader } from "../../../../components/layout/page-header";

type AccountCard = {
  segment: "CASH" | "BANK";
  accountCode: string;
  displayName: string;
  balances: { currency: string; amount: string }[];
};

type AccountCardsPayload = {
  accounts: AccountCard[];
  ledgerType?: string;
  dateFrom?: string;
  dateTo?: string;
};

function aggregateBankByCurrency(accounts: AccountCard[]): Record<string, string> {
  const sums = new Map<string, number>();
  for (const acc of accounts) {
    if (acc.segment !== "BANK") continue;
    for (const b of acc.balances) {
      const cur = (b.currency || "AZN").toUpperCase();
      const n = Number(b.amount);
      if (!Number.isFinite(n)) continue;
      sums.set(cur, (sums.get(cur) ?? 0) + n);
    }
  }
  const out: Record<string, string> = {};
  for (const [c, v] of sums) {
    out[c] = v.toFixed(2);
  }
  return out;
}

export default function TreasuryMoneyDashboardPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const lq = ledgerQueryParam(ledgerType);

  const [cashBalances, setCashBalances] = useState<Record<string, string> | null>(null);
  const [bankByCur, setBankByCur] = useState<Record<string, string> | null>(null);
  const [meta, setMeta] = useState<{ ledgerType?: string; dateFrom?: string; dateTo?: string } | null>(
    null,
  );
  const [cashErr, setCashErr] = useState<string | null>(null);
  const [bankErr, setBankErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !ledgerReady) return;
    setLoading(true);
    setCashErr(null);
    setBankErr(null);

    const [cashRes, bankRes] = await Promise.all([
      apiFetch(`/api/banking/cash/balances?${lq}`),
      apiFetch(`/api/banking/account-cards?${lq}`),
    ]);

    if (cashRes.ok) {
      setCashBalances((await cashRes.json()) as Record<string, string>);
    } else {
      setCashBalances(null);
      setCashErr(String(cashRes.status));
    }

    if (bankRes.ok) {
      const payload = (await bankRes.json()) as AccountCardsPayload;
      setMeta({
        ledgerType: payload.ledgerType,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
      });
      setBankByCur(aggregateBankByCurrency(payload.accounts ?? []));
    } else {
      setBankByCur(null);
      setBankErr(String(bankRes.status));
    }

    setLoading(false);
  }, [token, ledgerReady, lq]);

  useEffect(() => {
    if (!ready || !token || !ledgerReady) return;
    void load();
  }, [ready, token, ledgerReady, load]);

  if (!ready || !ledgerReady) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  const cashKeys = cashBalances ? Object.keys(cashBalances).sort() : [];
  const bankKeys = bankByCur ? Object.keys(bankByCur).sort() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("treasury.moneyTitle")}
        subtitle={
          <Fragment>
            <p className="m-0 max-w-2xl">{t("treasury.moneySubtitle")}</p>
            {meta?.dateFrom && meta.dateTo ? (
              <p className="m-0 mt-1 text-xs text-slate-500">
                {meta.ledgerType} · {meta.dateFrom} → {meta.dateTo}
              </p>
            ) : null}
          </Fragment>
        }
        actions={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => void load()} disabled={loading}>
            {loading ? t("common.loading") : t("common.refresh")}
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${CARD_CONTAINER_CLASS} p-5`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[2px] bg-[#EBEDF0] text-[#2980B9]">
              <Wallet className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#34495E] m-0">
                {t("banking.segmentCash")}
              </h2>
              <Link href="/banking/cash" className="text-[13px] text-action hover:underline">
                {t("treasury.openKassa")}
              </Link>
            </div>
          </div>
          {cashErr ? (
            <p className="text-sm text-amber-700 m-0">
              {t("treasury.cashUnavailable")}{" "}
              {cashErr}
            </p>
          ) : loading && !cashBalances ? (
            <p className="text-[#7F8C8D] text-sm">{t("common.loading")}</p>
          ) : (
            <ul className="space-y-2 m-0 p-0 list-none">
              {cashKeys.length === 0 ? (
                <li className="text-sm text-slate-600">—</li>
              ) : (
                cashKeys.map((c) => (
                  <li
                    key={c}
                    className="flex justify-between text-sm tabular-nums border-b border-slate-100 pb-2 last:border-0"
                  >
                    <span className="text-slate-600">{c}</span>
                    <span className="font-semibold text-[#34495E]">
                      {cashBalances![c]} {c}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <div className={`${CARD_CONTAINER_CLASS} p-5`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[2px] bg-[#EBEDF0] text-[#2980B9]">
              <Landmark className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#34495E] m-0">
                {t("banking.segmentBank")}
              </h2>
              <Link href="/banking" className="text-[13px] text-action hover:underline">
                {t("treasury.openBank")}
              </Link>
            </div>
          </div>
          {bankErr ? (
            <p className="text-sm text-amber-700 m-0">
              {t("treasury.bankUnavailable")}{" "}
              {bankErr}
            </p>
          ) : loading && !bankByCur ? (
            <p className="text-[#7F8C8D] text-sm">{t("common.loading")}</p>
          ) : (
            <ul className="space-y-2 m-0 p-0 list-none">
              {bankKeys.length === 0 ? (
                <li className="text-sm text-slate-600">—</li>
              ) : (
                bankKeys.map((c) => (
                  <li
                    key={c}
                    className="flex justify-between text-sm tabular-nums border-b border-slate-100 pb-2 last:border-0"
                  >
                    <span className="text-slate-600">{c}</span>
                    <span className="font-semibold text-[#34495E]">
                      {bankByCur![c]} {c}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
