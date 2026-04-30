"use client";

import Link from "next/link";
import { CheckCircle2, Printer, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../../../components/empty-state";
import { KO1PrintForm, type KO1PrintOrder } from "../../../../components/print/KO1PrintForm";
import { apiFetch } from "../../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_TEXTAREA_CLASS } from "../../../../lib/form-styles";
import { ledgerQueryParam, useLedger } from "../../../../lib/ledger-context";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { SubscriptionPaywall } from "../../../../components/subscription-paywall";
import { PageHeader } from "../../../../components/layout/page-header";

type CashOrderKind = "KMO" | "KXO";
type CashOrderStatus = "DRAFT" | "POSTED" | "CANCELLED";

type CashOrderRow = {
  id: string;
  orderNumber: string;
  date: string;
  kind: CashOrderKind;
  status: CashOrderStatus;
  currency: string;
  amount: string;
  purpose: string;
  skipJournalPosting?: boolean;
  counterparty?: { id: string; name: string } | null;
  employee?: { id: string; firstName: string; lastName: string } | null;
};

type PkoSubtype =
  | "INCOME_FROM_CUSTOMER"
  | "RETURN_FROM_ACCOUNTABLE"
  | "WITHDRAWAL_FROM_BANK"
  | "OTHER";

type RkoSubtype =
  | "SALARY"
  | "SUPPLIER_PAYMENT"
  | "ACCOUNTABLE_ISSUE"
  | "BANK_DEPOSIT"
  | "OTHER";

type AccountableRow = {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    finCode: string;
    accountableAccountCode244: string | null;
  };
  accountCode: string;
  balance: string;
  currency: string;
};

type CounterpartyRole = "CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER";
type CounterpartyOpt = { id: string; name: string; role?: CounterpartyRole };
type EmployeeOpt = {
  id: string;
  firstName: string;
  lastName: string;
  accountableAccountCode244?: string | null;
};

type CashCatalogRow = { code: string; name: string; cashProfile: string | null };

type CashFlowOpt = { id: string; code: string; name: string };
type CashDeskOpt = { id: string; name: string };

function defaultCashCodeForCurrency(
  currency: string,
  rows: CashCatalogRow[],
): string {
  const cur = currency.trim().toUpperCase() || "AZN";
  const want = cur === "AZN" ? "AZN" : "FX";
  const match = rows.filter((r) => r.cashProfile === want);
  if (match.length === 0) return want === "AZN" ? "101.01" : "102.01";
  return match[0].code;
}

function cashRowsForCurrency(currency: string, rows: CashCatalogRow[]) {
  const cur = currency.trim().toUpperCase() || "AZN";
  const want = cur === "AZN" ? "AZN" : "FX";
  return rows.filter((r) => r.cashProfile === want);
}

function CashAccountSelect({
  value,
  onChange,
  currency,
  catalog,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  currency: string;
  catalog: CashCatalogRow[];
  className: string;
}) {
  const opts = cashRowsForCurrency(currency, catalog);
  if (opts.length === 0) {
    return (
      <input className={className} value={value} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {opts.map((r) => (
        <option key={r.code} value={r.code}>
          {r.code} — {r.name}
        </option>
      ))}
    </select>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BankingCashPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType } = useLedger();
  const lq = ledgerQueryParam(ledgerType);

  const [balances, setBalances] = useState<Record<string, string> | null>(null);
  const [orders, setOrders] = useState<CashOrderRow[]>([]);
  const [accountable, setAccountable] = useState<AccountableRow[]>([]);
  const [counterparties, setCounterparties] = useState<CounterpartyOpt[]>([]);
  const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cashCatalog, setCashCatalog] = useState<CashCatalogRow[]>([]);
  const [cashFlowItems, setCashFlowItems] = useState<CashFlowOpt[]>([]);
  const [cashDesks, setCashDesks] = useState<CashDeskOpt[]>([]);

  const [pkoOpen, setPkoOpen] = useState(false);
  const [rkoOpen, setRkoOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  const [pkoDate, setPkoDate] = useState(todayIso);
  const [pkoSubtype, setPkoSubtype] = useState<PkoSubtype>("INCOME_FROM_CUSTOMER");
  const [pkoAmount, setPkoAmount] = useState("");
  const [pkoCurrency, setPkoCurrency] = useState("AZN");
  const [pkoPurpose, setPkoPurpose] = useState("");
  const [pkoCash, setPkoCash] = useState("101.01");
  const [pkoOffset, setPkoOffset] = useState("");
  const [pkoCpId, setPkoCpId] = useState("");
  const [pkoEmpId, setPkoEmpId] = useState("");
  const [pkoNotes, setPkoNotes] = useState("");
  const [pkoCfId, setPkoCfId] = useState("");
  const [pkoDeskId, setPkoDeskId] = useState("");

  const [rkoDate, setRkoDate] = useState(todayIso);
  const [rkoSubtype, setRkoSubtype] = useState<RkoSubtype>("SUPPLIER_PAYMENT");
  const [rkoAmount, setRkoAmount] = useState("");
  const [rkoCurrency, setRkoCurrency] = useState("AZN");
  const [rkoPurpose, setRkoPurpose] = useState("");
  const [rkoCash, setRkoCash] = useState("101.01");
  const [rkoOffset, setRkoOffset] = useState("");
  const [rkoCpId, setRkoCpId] = useState("");
  const [rkoEmpId, setRkoEmpId] = useState("");
  const [rkoNotes, setRkoNotes] = useState("");
  const [rkoCfId, setRkoCfId] = useState("");
  const [rkoDeskId, setRkoDeskId] = useState("");
  const [rkoWithholding, setRkoWithholding] = useState("");

  const [advEmployeeId, setAdvEmployeeId] = useState("");
  const [advDate, setAdvDate] = useState(todayIso);
  const [advLines, setAdvLines] = useState<{ amount: string; description: string }[]>([
    { amount: "", description: "" },
  ]);
  const [advPurpose, setAdvPurpose] = useState("");
  const [advSaving, setAdvSaving] = useState(false);
  const [advDraftId, setAdvDraftId] = useState<string | null>(null);

  const [quickDate, setQuickDate] = useState(todayIso);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickPurpose, setQuickPurpose] = useState("");
  const [quickCfId, setQuickCfId] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  const [ko1PrintOrder, setKo1PrintOrder] = useState<KO1PrintOrder | null>(null);
  const [viewOrder, setViewOrder] = useState<CashOrderRow | null>(null);

  const loadCore = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    const [b, o, c, e, chart, cf, desks] = await Promise.all([
      apiFetch(`/api/banking/cash/balances?${lq}`),
      apiFetch("/api/banking/cash/orders"),
      apiFetch("/api/counterparties"),
      apiFetch("/api/hr/employees?page=1&pageSize=100"),
      apiFetch("/api/accounts/chart/cash-catalog"),
      apiFetch("/api/treasury/cash-flow-items"),
      apiFetch("/api/treasury/cash-desks"),
    ]);
    if (!b.ok || !o.ok) {
      const msg = t("banking.cash.loadErr");
      toast.error(msg);
      setErr(msg);
      setLoading(false);
      return;
    }
    setBalances((await b.json()) as Record<string, string>);
    setOrders((await o.json()) as CashOrderRow[]);
    if (c.ok) {
      setCounterparties((await c.json()) as CounterpartyOpt[]);
    }
    if (e.ok) {
      const ej = (await e.json()) as { items?: EmployeeOpt[] };
      setEmployees(ej.items ?? []);
    }
    if (chart.ok) {
      setCashCatalog((await chart.json()) as CashCatalogRow[]);
    }
    if (cf.ok) {
      setCashFlowItems((await cf.json()) as CashFlowOpt[]);
    } else {
      setCashFlowItems([]);
    }
    if (desks.ok) {
      setCashDesks((await desks.json()) as CashDeskOpt[]);
    } else {
      setCashDesks([]);
    }
    const accRes = await apiFetch(`/api/banking/cash/accountable?${lq}`);
    if (accRes.ok) {
      setAccountable((await accRes.json()) as AccountableRow[]);
    }
    setLoading(false);
  }, [token, t, lq]);

  const loadAccountable = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch(`/api/banking/cash/accountable?${lq}`);
    if (res.ok) {
      setAccountable((await res.json()) as AccountableRow[]);
    }
  }, [token, lq]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadCore();
  }, [ready, token, loadCore]);

  useEffect(() => {
    if (pkoSubtype === "INCOME_FROM_CUSTOMER") {
      setPkoEmpId("");
    } else if (pkoSubtype === "RETURN_FROM_ACCOUNTABLE") {
      setPkoCpId("");
    }
  }, [pkoSubtype]);

  useEffect(() => {
    if (cashFlowItems.length === 0) return;
    const first = cashFlowItems[0].id;
    setPkoCfId((v) => v || first);
    setRkoCfId((v) => v || first);
    setQuickCfId((v) => v || first);
  }, [cashFlowItems]);

  useEffect(() => {
    if (cashCatalog.length === 0) return;
    const allowed = new Set(
      cashRowsForCurrency(pkoCurrency, cashCatalog).map((r) => r.code),
    );
    if (!allowed.has(pkoCash)) {
      setPkoCash(defaultCashCodeForCurrency(pkoCurrency, cashCatalog));
    }
  }, [pkoCurrency, cashCatalog, pkoCash]);

  useEffect(() => {
    if (cashCatalog.length === 0) return;
    const allowed = new Set(
      cashRowsForCurrency(rkoCurrency, cashCatalog).map((r) => r.code),
    );
    if (!allowed.has(rkoCash)) {
      setRkoCash(defaultCashCodeForCurrency(rkoCurrency, cashCatalog));
    }
  }, [rkoCurrency, cashCatalog, rkoCash]);

  const partyLabel = useCallback((row: CashOrderRow) => {
    if (row.counterparty?.name) return row.counterparty.name;
    if (row.employee) {
      return `${row.employee.firstName} ${row.employee.lastName}`.trim();
    }
    return "—";
  }, []);

  const typeLabel = useCallback(
    (row: CashOrderRow) =>
      row.kind === "KMO" ? t("banking.cash.typeIn") : t("banking.cash.typeOut"),
    [t],
  );

  const statusLabel = useCallback(
    (s: CashOrderStatus) =>
      s === "POSTED" ? t("banking.cash.statusPosted") : t("banking.cash.statusDraft"),
    [t],
  );

  async function openPrint(orderId: string) {
    const res = await apiFetch(`/api/banking/cash/orders/${orderId}/print`);
    const html = await res.text();
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  function printKo1ForRow(row: CashOrderRow) {
    if (row.kind !== "KMO") {
      void openPrint(row.id);
      return;
    }
    const fromParty = row.counterparty?.name
      ? row.counterparty.name
      : row.employee
        ? `${row.employee.firstName} ${row.employee.lastName}`.trim()
        : "—";

    setKo1PrintOrder({
      orderNumber: row.orderNumber,
      dateIso: row.date?.slice?.(0, 10) ?? todayIso(),
      organizationName: "", // will be filled once API includes org info in list (KO-1 still prints)
      organizationTaxId: null,
      fromParty,
      purpose: row.purpose ?? "",
      amount: String(row.amount ?? "0"),
    });
    window.setTimeout(() => window.print(), 50);
  }

  async function submitPko(e: React.FormEvent) {
    e.preventDefault();
    if (!pkoCfId) {
      toast.error(t("banking.cash.cashFlowRequired"));
      return;
    }
    const body: Record<string, unknown> = {
      date: pkoDate,
      pkoSubtype,
      amount: Number(pkoAmount.replace(",", ".")),
      currency: pkoCurrency,
      purpose: pkoPurpose,
      cashAccountCode: pkoCash,
      cashFlowItemId: pkoCfId,
    };
    if (pkoOffset.trim()) body.offsetAccountCode = pkoOffset.trim();
    if (pkoCpId) body.counterpartyId = pkoCpId;
    if (pkoEmpId) body.employeeId = pkoEmpId;
    if (pkoNotes.trim()) body.notes = pkoNotes.trim();
    if (pkoDeskId) body.cashDeskId = pkoDeskId;
    const res = await apiFetch("/api/banking/cash/orders/kmo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setPkoOpen(false);
      setPkoAmount("");
      setPkoPurpose("");
      setPkoNotes("");
      await loadCore();
    }
  }

  async function submitRko(e: React.FormEvent) {
    e.preventDefault();
    if (!rkoCfId) {
      toast.error(t("banking.cash.cashFlowRequired"));
      return;
    }
    const body: Record<string, unknown> = {
      date: rkoDate,
      rkoSubtype,
      amount: Number(rkoAmount.replace(",", ".")),
      currency: rkoCurrency,
      purpose: rkoPurpose,
      cashAccountCode: rkoCash,
      cashFlowItemId: rkoCfId,
    };
    if (rkoOffset.trim()) body.offsetAccountCode = rkoOffset.trim();
    if (rkoCpId) body.counterpartyId = rkoCpId;
    if (rkoEmpId) body.employeeId = rkoEmpId;
    if (rkoNotes.trim()) body.notes = rkoNotes.trim();
    if (rkoDeskId) body.cashDeskId = rkoDeskId;
    const wht = Number(rkoWithholding.replace(",", "."));
    if (Number.isFinite(wht) && wht > 0) {
      body.withholdingTaxAmount = wht;
    }
    const res = await apiFetch("/api/banking/cash/orders/kxo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setRkoOpen(false);
      setRkoAmount("");
      setRkoPurpose("");
      setRkoNotes("");
      setRkoWithholding("");
      await loadCore();
    }
  }

  async function postOrder(id: string) {
    const res = await apiFetch(`/api/banking/cash/orders/${id}/post`, {
      method: "POST",
    });
    if (res.ok) await loadCore();
  }

  async function submitQuickCashOut(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(quickAmount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0 || !quickPurpose.trim()) return;
    if (!quickCfId) {
      toast.error(t("banking.cash.cashFlowRequired"));
      return;
    }
    setQuickBusy(true);
    const create = await apiFetch("/api/banking/cash/orders/kxo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: quickDate,
        rkoSubtype: "OTHER",
        amount: amt,
        currency: "AZN",
        purpose: quickPurpose.trim(),
        cashAccountCode: "101.01",
        offsetAccountCode: "731",
        cashFlowItemId: quickCfId,
      }),
    });
    if (!create.ok) {
      setQuickBusy(false);
      return;
    }
    const row = (await create.json()) as { id: string };
    const post = await apiFetch(`/api/banking/cash/orders/${row.id}/post`, {
      method: "POST",
    });
    setQuickBusy(false);
    if (post.ok) {
      setQuickAmount("");
      setQuickPurpose("");
      await loadCore();
    }
  }

  const accountableOptions = useMemo(
    () => accountable.map((r) => r.employee),
    [accountable],
  );

  async function submitAdvanceDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!advEmployeeId) return;
    setAdvSaving(true);
    const lines = advLines
      .map((x) => ({
        amount: Number(x.amount.replace(",", ".")),
        description: x.description.trim(),
      }))
      .filter((x) => x.amount > 0 && x.description);
    const res = await apiFetch("/api/banking/cash/advance-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: advEmployeeId,
        reportDate: advDate,
        expenseLines: lines,
        purpose: advPurpose.trim() || undefined,
      }),
    });
    setAdvSaving(false);
    if (res.ok) {
      const row = (await res.json()) as { id: string };
      setAdvDraftId(row.id);
    }
  }

  async function postAdvance() {
    if (!advDraftId) return;
    setAdvSaving(true);
    const res = await apiFetch(`/api/banking/cash/advance-reports/${advDraftId}/post`, {
      method: "POST",
    });
    setAdvSaving(false);
    if (res.ok) {
      setAdvDraftId(null);
      setAdvLines([{ amount: "", description: "" }]);
      setAdvPurpose("");
      setAdvEmployeeId("");
      await loadAccountable();
      await loadCore();
      setAdvOpen(false);
    }
  }

  if (!ready || !token) return null;

  return (
    <SubscriptionPaywall module="kassaPro">
      <>
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #ko1-print-root,
            #ko1-print-root * {
              visibility: visible !important;
            }
            #ko1-print-root {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: white;
            }
          }
        `}</style>
        <div id="ko1-print-root" className="hidden print:block">
          {ko1PrintOrder ? <KO1PrintForm order={ko1PrintOrder} lang="az" /> : null}
        </div>

        <section className="space-y-6 max-w-7xl mx-auto">
        <PageHeader
          title={t("banking.cash.pageTitle")}
          subtitle={
            <Link
              href="/banking"
              className="text-[13px] text-action hover:opacity-90 inline-block"
            >
              {t("banking.cash.backLink")}
            </Link>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => setPkoOpen(true)}
                className={PRIMARY_BUTTON_CLASS}
              >
                {t("banking.cash.btnPko")}
              </button>
              <button
                type="button"
                onClick={() => setRkoOpen(true)}
                className={SECONDARY_BUTTON_CLASS}
              >
                {t("banking.cash.btnRko")}
              </button>
              <button
                type="button"
                onClick={() => setAdvOpen(true)}
                className={SECONDARY_BUTTON_CLASS}
              >
                {t("banking.cash.btnAdvanceTop")}
              </button>
              <button
                type="button"
                onClick={() => setQuickOpen(true)}
                className={SECONDARY_BUTTON_CLASS}
              >
                {t("banking.cash.quickCashOutTitle")}
              </button>
            </>
          }
        />

        {err && !loading ? (
          <EmptyState
            title={err}
            description={t("banking.cash.loadErrHint")}
            icon={<Wallet className="h-10 w-10" aria-hidden />}
          />
        ) : null}
        {!err && (
          <>
            {loading && <p className="text-[#7F8C8D] text-[13px]">{t("common.loading")}</p>}

            <div className="space-y-4 w-full">
            <div className={`${CARD_CONTAINER_CLASS} p-5`}>
              <h2 className="text-base font-semibold text-[#34495E] m-0">{t("banking.cash.balanceTitle")}</h2>
              {balances && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500 m-0">{t("banking.cash.currencyAzn")}</p>
                    <p className="text-lg font-semibold tabular-nums m-0">{balances.AZN ?? "0.00"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 m-0">{t("banking.cash.currencyUsd")}</p>
                    <p className="text-lg font-semibold tabular-nums m-0">{balances.USD ?? "0.00"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 m-0">{t("banking.cash.currencyEur")}</p>
                    <p className="text-lg font-semibold tabular-nums m-0">{balances.EUR ?? "0.00"}</p>
                  </div>
                </div>
              )}
            </div>

            <div className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
              <h2 className="m-0 px-4 pt-4 text-base font-semibold text-[#34495E]">
                {t("banking.cash.journalTitle")}
              </h2>
              <table className="min-w-full text-sm mt-3">
                <thead>
                  <tr className="border-b border-[#D5DADF] text-left text-[13px] text-[#34495E]">
                    <th className="px-4 py-2 font-semibold">{t("banking.cash.colOrderNo")}</th>
                    <th className="px-4 py-2 font-semibold">{t("banking.cash.colDate")}</th>
                    <th className="px-4 py-2 font-semibold">{t("banking.cash.colType")}</th>
                    <th className="px-4 py-2 font-semibold">{t("banking.cash.colParty")}</th>
                    <th className="px-4 py-2 font-semibold">{t("banking.cash.colPurpose")}</th>
                    <th className="px-4 py-2 text-right font-semibold">{t("banking.cash.colAmount")}</th>
                    <th className="w-36 px-4 py-2 font-semibold">{t("banking.cash.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-4 py-2 font-mono text-xs">
                        <button
                          type="button"
                          className="text-left hover:underline underline-offset-2"
                          onClick={() => setViewOrder(row)}
                        >
                          {row.orderNumber}
                        </button>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {row.date?.slice?.(0, 10) ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className="block">{typeLabel(row)}</span>
                        <span className="text-xs text-slate-500">{statusLabel(row.status)}</span>
                      </td>
                      <td className="px-4 py-2">{partyLabel(row)}</td>
                      <td className="px-4 py-2 max-w-xs truncate" title={row.purpose}>
                        {row.purpose}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {row.amount} {row.currency}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setViewOrder(row)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            {t("common.view")}
                          </button>
                          <button
                            type="button"
                            onClick={() => printKo1ForRow(row)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            title={t("banking.cash.print")}
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden />
                            {t("banking.cash.print")}
                          </button>
                          {row.status === "DRAFT" && (
                            <button
                              type="button"
                              onClick={() => void postOrder(row.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-action px-2 py-1 text-xs font-medium text-white hover:bg-action-hover"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {t("banking.cash.postOrder")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && orders.length === 0 && (
                <p className="px-4 py-6 text-slate-500 text-sm">—</p>
              )}
            </div>

            {viewOrder ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold m-0">
                        {viewOrder.orderNumber}
                      </h3>
                      <p className="mb-0 mt-1 text-xs text-slate-600">
                        {viewOrder.date?.slice?.(0, 10) ?? "—"} · {typeLabel(viewOrder)} ·{" "}
                        {statusLabel(viewOrder.status)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={SECONDARY_BUTTON_CLASS}
                      onClick={() => setViewOrder(null)}
                    >
                      {t("common.close")}
                    </button>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-800">
                    <div>
                      <span className="text-xs font-medium text-slate-500">
                        {t("banking.cash.colParty")}
                      </span>
                      <div className="mt-0.5">{partyLabel(viewOrder)}</div>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-slate-500">
                        {t("banking.cash.colPurpose")}
                      </span>
                      <div className="mt-0.5">{viewOrder.purpose}</div>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-slate-500">
                        {t("banking.cash.colAmount")}
                      </span>
                      <div className="mt-0.5 tabular-nums">
                        {viewOrder.amount} {viewOrder.currency}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-[2px] border border-[#D5DADF] bg-white px-3 py-2 text-[13px] font-medium text-[#34495E] hover:bg-[#F4F5F7]"
                      onClick={() => printKo1ForRow(viewOrder)}
                    >
                      <Printer className="h-4 w-4" aria-hidden />
                      {t("banking.cash.print")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className={`${CARD_CONTAINER_CLASS} p-4`}>
              <h2 className="m-0 text-sm font-semibold text-[#34495E]">{t("banking.cash.sideAccountableTitle")}</h2>
              <p className="mb-3 mt-1 text-xs text-[#7F8C8D]">{t("banking.cash.accountableHint")}</p>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="py-1.5 pr-2 font-medium">{t("banking.cash.thEmployee")}</th>
                    <th className="py-1.5 font-medium text-right">{t("banking.cash.thBalance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {accountable.map((r) => (
                    <tr key={r.employee.id} className="border-b border-slate-50">
                      <td className="py-1.5 pr-2">
                        {r.employee.firstName} {r.employee.lastName}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.balance} {r.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {accountable.length === 0 && (
                <p className="text-xs text-slate-500 mt-2 mb-0">{t("banking.cash.accountableEmpty")}</p>
              )}
            </div>
        </div>
          </>
        )}

        {quickOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div>
                <h3 className="text-lg font-semibold m-0">{t("banking.cash.quickCashOutTitle")}</h3>
                <p className="mb-0 mt-1 text-xs text-slate-600">{t("banking.cash.quickCashOutHint")}</p>
              </div>

              <form className="space-y-3 mt-4" onSubmit={submitQuickCashOut}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-[#34495E]">{t("banking.cash.outAmount")}</p>
                    <input
                      className={FORM_INPUT_CLASS}
                      value={quickAmount}
                      onChange={(e) => setQuickAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-[#34495E]">{t("banking.cash.outDate")}</p>
                    <input
                      type="date"
                      className={FORM_INPUT_CLASS}
                      value={quickDate}
                      onChange={(e) => setQuickDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <p className="mb-1 text-xs font-medium text-[#34495E]">{t("banking.cash.outDesc")}</p>
                    <input
                      className={FORM_INPUT_CLASS}
                      value={quickPurpose}
                      onChange={(e) => setQuickPurpose(e.target.value)}
                      placeholder={t("banking.cash.outDescPh")}
                      required
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-[#34495E]">{t("banking.cash.cashFlowItem")}</p>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={quickCfId}
                    onChange={(e) => setQuickCfId(e.target.value)}
                    required
                  >
                    {cashFlowItems.map((cf) => (
                      <option key={cf.id} value={cf.id}>
                        {cf.code} — {cf.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASS}
                    onClick={() => setQuickOpen(false)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button type="submit" disabled={quickBusy} className={PRIMARY_BUTTON_CLASS}>
                    {quickBusy ? "…" : t("banking.cash.quickCashOutSubmit")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {advOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div>
                <h3 className="text-lg font-semibold m-0">{t("banking.cash.btnAdvanceTop")}</h3>
                <p className="mb-0 mt-1 text-xs text-slate-600">{t("banking.cash.advanceHint")}</p>
              </div>

              <form className="space-y-3 mt-4" onSubmit={submitAdvanceDraft}>
                <div>
                  <label className="block text-xs font-medium text-[#34495E]">{t("banking.cash.advanceEmployee")}</label>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={advEmployeeId}
                    onChange={(e) => setAdvEmployeeId(e.target.value)}
                    required
                  >
                    <option value="">—</option>
                    {(accountableOptions.length
                      ? accountableOptions
                      : employees.filter((e) => e.accountableAccountCode244?.trim())
                    ).map((em) => (
                      <option key={em.id} value={em.id}>
                        {em.firstName} {em.lastName}
                        {em.accountableAccountCode244 ? ` · ${em.accountableAccountCode244}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#34495E]">{t("banking.cash.advanceReportDate")}</label>
                  <input
                    type="date"
                    className={FORM_INPUT_CLASS}
                    value={advDate}
                    onChange={(e) => setAdvDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-[#34495E]">{t("banking.cash.advanceLines")}</p>
                  {advLines.map((line, i) => (
                    <div key={i} className="flex flex-wrap gap-2 mb-2">
                      <input
                        className={FORM_INPUT_CLASS + " max-w-[100px]"}
                        placeholder={t("banking.cash.amount")}
                        value={line.amount}
                        onChange={(e) => {
                          const next = [...advLines];
                          next[i] = { ...next[i], amount: e.target.value };
                          setAdvLines(next);
                        }}
                      />
                      <input
                        className={FORM_INPUT_CLASS + " flex-1 min-w-0"}
                        placeholder={t("banking.cash.description")}
                        value={line.description}
                        onChange={(e) => {
                          const next = [...advLines];
                          next[i] = { ...next[i], description: e.target.value };
                          setAdvLines(next);
                        }}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setAdvLines([...advLines, { amount: "", description: "" }])}
                  >
                    {t("banking.cash.advanceAddLine")}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#34495E]">{t("banking.cash.purpose")}</label>
                  <input
                    className={FORM_INPUT_CLASS}
                    value={advPurpose}
                    onChange={(e) => setAdvPurpose(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASS}
                    onClick={() => setAdvOpen(false)}
                    disabled={advSaving}
                  >
                    {t("common.cancel")}
                  </button>
                  <button type="submit" disabled={advSaving} className={PRIMARY_BUTTON_CLASS}>
                    {t("banking.cash.advanceSubmitDraft")}
                  </button>
                  {advDraftId && (
                    <button
                      type="button"
                      disabled={advSaving}
                      onClick={() => void postAdvance()}
                      className="rounded-lg bg-action px-3 py-1.5 text-xs font-medium text-white hover:bg-action-hover"
                    >
                      {t("banking.cash.advancePost")}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {pkoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold m-0">{t("banking.cash.pkoTitle")}</h3>
              <form className="mt-4 space-y-3" onSubmit={submitPko}>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.date")}</label>
                  <input
                    type="date"
                    className={FORM_INPUT_CLASS}
                    value={pkoDate}
                    onChange={(e) => setPkoDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.pkoSubtype")}</label>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={pkoSubtype}
                    onChange={(e) => setPkoSubtype(e.target.value as PkoSubtype)}
                  >
                    <option value="INCOME_FROM_CUSTOMER">{t("banking.cash.subtypeIncomeCustomer")}</option>
                    <option value="RETURN_FROM_ACCOUNTABLE">{t("banking.cash.subtypeReturnAccountable")}</option>
                    <option value="WITHDRAWAL_FROM_BANK">{t("banking.cash.subtypeBankWithdrawal")}</option>
                    <option value="OTHER">{t("banking.cash.subtypeOther")}</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.amount")}</label>
                    <input
                      className={FORM_INPUT_CLASS}
                      value={pkoAmount}
                      onChange={(e) => setPkoAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.currency")}</label>
                    <input
                      className={FORM_INPUT_CLASS}
                      value={pkoCurrency}
                      onChange={(e) => setPkoCurrency(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.purpose")}</label>
                  <input className={FORM_INPUT_CLASS} value={pkoPurpose} onChange={(e) => setPkoPurpose(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.cashAccount")}</label>
                  <CashAccountSelect
                    className={FORM_INPUT_CLASS}
                    currency={pkoCurrency}
                    catalog={cashCatalog}
                    value={pkoCash}
                    onChange={setPkoCash}
                  />
                </div>
                {(pkoSubtype === "OTHER" || pkoSubtype === "RETURN_FROM_ACCOUNTABLE") && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.offsetAccount")}</label>
                    <input className={FORM_INPUT_CLASS} value={pkoOffset} onChange={(e) => setPkoOffset(e.target.value)} />
                  </div>
                )}
                {pkoSubtype === "INCOME_FROM_CUSTOMER" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.counterparty")}</label>
                    <select
                      className={FORM_INPUT_CLASS}
                      value={pkoCpId}
                      onChange={(e) => setPkoCpId(e.target.value)}
                    >
                      <option value="">—</option>
                      {counterparties
                        .filter((c) => c.role === "CUSTOMER" || c.role === "BOTH" || c.role == null)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                {pkoSubtype === "RETURN_FROM_ACCOUNTABLE" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.employee")}</label>
                    <select
                      className={FORM_INPUT_CLASS}
                      value={pkoEmpId}
                      onChange={(e) => setPkoEmpId(e.target.value)}
                    >
                      <option value="">—</option>
                      {employees.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.firstName} {c.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.cashFlowItem")}</label>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={pkoCfId}
                    onChange={(e) => setPkoCfId(e.target.value)}
                    required
                  >
                    {cashFlowItems.map((cf) => (
                      <option key={cf.id} value={cf.id}>
                        {cf.code} — {cf.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.cashDeskOptional")}</label>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={pkoDeskId}
                    onChange={(e) => setPkoDeskId(e.target.value)}
                  >
                    <option value="">—</option>
                    {cashDesks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.notes")}</label>
                  <textarea className={FORM_TEXTAREA_CLASS} value={pkoNotes} onChange={(e) => setPkoNotes(e.target.value)} rows={2} />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASS}
                    onClick={() => setPkoOpen(false)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    {t("banking.cash.saveDraft")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {rkoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold m-0">{t("banking.cash.rkoTitle")}</h3>
              <form className="mt-4 space-y-3" onSubmit={submitRko}>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.date")}</label>
                  <input
                    type="date"
                    className={FORM_INPUT_CLASS}
                    value={rkoDate}
                    onChange={(e) => setRkoDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.rkoSubtype")}</label>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={rkoSubtype}
                    onChange={(e) => setRkoSubtype(e.target.value as RkoSubtype)}
                  >
                    <option value="SALARY">{t("banking.cash.subtypeSalary")}</option>
                    <option value="SUPPLIER_PAYMENT">{t("banking.cash.subtypeSupplier")}</option>
                    <option value="ACCOUNTABLE_ISSUE">{t("banking.cash.subtypeAccountableIssue")}</option>
                    <option value="BANK_DEPOSIT">{t("banking.cash.subtypeBankDeposit")}</option>
                    <option value="OTHER">{t("banking.cash.subtypeOther")}</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.amount")}</label>
                    <input
                      className={FORM_INPUT_CLASS}
                      value={rkoAmount}
                      onChange={(e) => setRkoAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.currency")}</label>
                    <input
                      className={FORM_INPUT_CLASS}
                      value={rkoCurrency}
                      onChange={(e) => setRkoCurrency(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.withholdingTax")}</label>
                  <input
                    className={FORM_INPUT_CLASS}
                    value={rkoWithholding}
                    onChange={(e) => setRkoWithholding(e.target.value)}
                    placeholder="0"
                  />
                  <p className="mt-1 text-[11px] text-slate-500 m-0">{t("banking.cash.withholdingHint")}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.purpose")}</label>
                  <input className={FORM_INPUT_CLASS} value={rkoPurpose} onChange={(e) => setRkoPurpose(e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.cashAccount")}</label>
                  <CashAccountSelect
                    className={FORM_INPUT_CLASS}
                    currency={rkoCurrency}
                    catalog={cashCatalog}
                    value={rkoCash}
                    onChange={setRkoCash}
                  />
                </div>
                {rkoSubtype === "OTHER" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">{t("banking.cash.offsetAccount")}</label>
                    <input className={FORM_INPUT_CLASS} value={rkoOffset} onChange={(e) => setRkoOffset(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.counterparty")}</label>
                  <select className={FORM_INPUT_CLASS} value={rkoCpId} onChange={(e) => setRkoCpId(e.target.value)}>
                    <option value="">—</option>
                    {counterparties.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.employee")}</label>
                  <select className={FORM_INPUT_CLASS} value={rkoEmpId} onChange={(e) => setRkoEmpId(e.target.value)}>
                    <option value="">—</option>
                    {employees.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.cashFlowItem")}</label>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={rkoCfId}
                    onChange={(e) => setRkoCfId(e.target.value)}
                    required
                  >
                    {cashFlowItems.map((cf) => (
                      <option key={cf.id} value={cf.id}>
                        {cf.code} — {cf.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.cashDeskOptional")}</label>
                  <select
                    className={FORM_INPUT_CLASS}
                    value={rkoDeskId}
                    onChange={(e) => setRkoDeskId(e.target.value)}
                  >
                    <option value="">—</option>
                    {cashDesks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">{t("banking.cash.notes")}</label>
                  <textarea className={FORM_TEXTAREA_CLASS} value={rkoNotes} onChange={(e) => setRkoNotes(e.target.value)} rows={2} />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASS}
                    onClick={() => setRkoOpen(false)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className={PRIMARY_BUTTON_CLASS}>
                    {t("banking.cash.saveDraft")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        </section>
      </>
    </SubscriptionPaywall>
  );
}
