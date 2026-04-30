"use client";

import Link from "next/link";
import { Building2, Landmark, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../../components/layout/page-header";
import { EmptyState } from "../../components/empty-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { formatMoneyAzn } from "../../lib/format-money";
import { FORM_INPUT_CLASS } from "../../lib/form-styles";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { ledgerQueryParam, useLedger } from "../../lib/ledger-context";
import { useRequireAuth } from "../../lib/use-require-auth";
import { SubscriptionPaywall } from "../../components/subscription-paywall";

type AccountSegment = "CASH" | "BANK";

type AccountCardRow = {
  segment: AccountSegment;
  accountCode: string;
  displayName: string;
  maskedNumber: string;
  balances: { currency: string; amount: string }[];
};

type AccountCardsResponse = {
  dateFrom: string;
  dateTo: string;
  ledgerType: string;
  accounts: AccountCardRow[];
};

type BankLine = {
  id: string;
  description: string | null;
  amount: unknown;
  type: string;
  origin: string;
  isMatched: boolean;
  counterpartyTaxId: string | null;
  valueDate: string | null;
  bankStatement: {
    bankName: string;
    date: string;
    channel: string;
  };
  matchedInvoice: {
    id: string;
    number: string;
    status: string;
  } | null;
};

type Candidate = {
  id: string;
  number: string;
  status: string;
  totalAmount: unknown;
  counterparty: { name: string; taxId: string };
};

type SyncStatus = {
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  webhookUrl: string | null;
};

type OutboundDraft = {
  id: string;
  amount: unknown;
  currency: string;
  recipientIban: string;
  purpose: string;
  status: "PENDING" | "SENT" | "REJECTED" | "COMPLETED";
  provider?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
};

function BankingQuickExpenseModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [cfItems, setCfItems] = useState<{ id: string; code: string; name: string }[]>([]);
  const [amount, setAmount] = useState("");
  const [bankAcc, setBankAcc] = useState("221.01");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cfId, setCfId] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [createAccOpen, setCreateAccOpen] = useState(false);

  const loadCf = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch("/api/treasury/cash-flow-items");
    if (res.ok) {
      const list = (await res.json()) as { id: string; code: string; name: string }[];
      setCfItems(list);
      if (list[0]) setCfId((v) => v || list[0].id);
    }
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadCf();
  }, [ready, token, loadCf]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !cfId) {
      toast.error(t("banking.cash.cashFlowRequired"));
      return;
    }
    const amt = Number(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) return;
    setBusy(true);
    const res = await apiFetch("/api/banking/manual-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "OUTFLOW",
        amount: amt,
        bankAccountCode: bankAcc.trim(),
        offsetAccountCode: "731",
        date,
        cashFlowItemId: cfId,
        description: desc.trim() || undefined,
      }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(t("banking.manualEntryOk"));
      setAmount("");
      setDesc("");
      onDone();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-lg p-6 bg-white`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">{t("banking.quickExpense")}</h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">
              {t("banking.manualEntryHint")}
            </p>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>

        <form className="space-y-4 mt-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              {t("banking.thAmount")}
              <input
                className={FORM_INPUT_CLASS}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t("banking.cashOutDate")}
              <input
                type="date"
                className={FORM_INPUT_CLASS}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium text-gray-700 md:col-span-2">
              {t("banking.manualEntryDds")}
              <select
                className={FORM_INPUT_CLASS}
                value={cfId}
                onChange={(e) => setCfId(e.target.value)}
                required
              >
                {cfItems.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700 md:col-span-2">
              {t("banking.manualEntryBankAcc")}
              <div className="mt-1 flex items-center gap-2">
                <input
                  className={`flex-1 ${FORM_INPUT_CLASS}`}
                  value={bankAcc}
                  onChange={(e) => setBankAcc(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-[#D5DADF] bg-white text-[#2980B9] hover:bg-[#F4F5F7]"
                  onClick={() => setCreateAccOpen(true)}
                  title={t("banking.newBankAccountBtn")}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </label>
            <label className="block text-sm font-medium text-gray-700 md:col-span-2">
              {t("banking.manualEntryDesc")}
              <input
                className={FORM_INPUT_CLASS}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t("banking.cashOutDescPh")}
              />
            </label>
          </div>
          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}>
            {busy ? t("banking.uploadHint") : t("banking.manualEntrySubmit")}
          </button>
        </form>
      </div>
      {createAccOpen ? (
        <CreateBankAccountModal
          onClose={() => setCreateAccOpen(false)}
          onCreated={(code) => {
            setBankAcc(code);
            setCreateAccOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateBankAccountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const { t } = useTranslation();
  const { token } = useRequireAuth();
  const [code, setCode] = useState("221.01");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"AZN" | "USD" | "EUR">("AZN");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    const res = await apiFetch("/api/accounts/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, currency }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("banking.createBankAccountErr"));
      return;
    }
    const created = (await res.json()) as { code?: string };
    toast.success(t("banking.createBankAccountOk"));
    onCreated(created.code || code);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-md p-6 bg-white`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">
              {t("banking.createBankAccountTitle")}
            </h3>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>

        <form className="mt-4 space-y-4" onSubmit={(e) => void submit(e)}>
          <label className="block text-sm font-medium text-gray-700">
            {t("banking.createBankAccountCode")}
            <input className={FORM_INPUT_CLASS} value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("banking.createBankAccountName")}
            <input className={FORM_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            {t("banking.createBankAccountCurrency")}
            <select className={FORM_INPUT_CLASS} value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
              <option value="AZN">AZN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}>
            {busy ? t("common.loading") : t("banking.createBankAccountSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
}

function formatBalanceLine(amount: string, currency: string): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return "—";
  if (currency === "AZN") return formatMoneyAzn(n);
  const s = new Intl.NumberFormat("az-AZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${s.replace(/\u00a0/g, " ")} ${currency}`;
}

function segmentIcon(segment: AccountSegment) {
  return segment === "CASH" ? Wallet : Landmark;
}

function isoDateFromRow(valueDate: string | null): string | null {
  if (!valueDate) return null;
  return String(valueDate).slice(0, 10);
}

function sourceLabelKey(origin: string): string {
  switch (origin) {
    case "INVOICE_PAYMENT_SYSTEM":
      return "banking.sourceSystem";
    case "FILE_IMPORT":
      return "banking.sourceImport";
    case "DIRECT_SYNC":
      return "banking.sourceSync";
    case "WEBHOOK":
      return "banking.sourceWebhook";
    case "MANUAL_CASH_OUT":
      return "banking.sourceManualCash";
    case "MANUAL_BANK_ENTRY":
      return "banking.sourceManualBank";
    default:
      return "banking.sourceOther";
  }
}

function CashAccountCards({
  refreshKey,
  segmentFilter = "ALL",
}: {
  refreshKey: number;
  /** На странице «Банк» показываем только банковские счета; касса — в разделе Kassa. */
  segmentFilter?: "ALL" | "BANK" | "CASH";
}) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const [data, setData] = useState<AccountCardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createBankOpen, setCreateBankOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token || !ledgerReady) return;
    setLoading(true);
    setError(null);
    const path = `/api/banking/account-cards?${ledgerQueryParam(ledgerType)}`;
    const res = await apiFetch(path);
    if (!res.ok) {
      const detail = String(res.status);
      toast.error(t("banking.accountsLoadErr"), { description: detail });
      setError(detail);
      setData(null);
      setLoading(false);
      return;
    }
    setData((await res.json()) as AccountCardsResponse);
    setLoading(false);
  }, [token, ledgerReady, ledgerType, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token, refreshKey]);

  if (!ready || !token) return null;

  const accounts =
    !loading && !error && data
      ? segmentFilter === "ALL"
        ? data.accounts
        : data.accounts.filter((a) => a.segment === segmentFilter)
      : [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 m-0">{t("banking.accountsTitle")}</h2>
          <p className="text-sm text-slate-600 mt-1 mb-0 max-w-2xl">{t("banking.accountsHint")}</p>
          {data ? (
            <p className="text-xs text-slate-500 mt-1 mb-0">
              {data.ledgerType} · {data.dateFrom} → {data.dateTo}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/reporting"
            className="text-[13px] font-medium text-action hover:opacity-90 underline underline-offset-2"
          >
            {t("banking.reportingLink")}
          </Link>
        </div>
      </div>
      {loading && <p className="text-[#7F8C8D] text-[13px] m-0">{t("common.loading")}</p>}
      {!loading && error && (
        <EmptyState
          title={t("banking.accountsLoadErr")}
          description={t("banking.accountsLoadErrHint")}
          icon={<Landmark className="h-10 w-10" aria-hidden />}
        />
      )}
      {!loading && !error && data && accounts.length === 0 && (
        <EmptyState
          title={t("banking.accountsEmpty")}
          icon={<Landmark className="h-10 w-10" aria-hidden />}
          action={
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASS}
              onClick={() => setCreateBankOpen(true)}
            >
              {t("banking.newBankAccountBtn")}
            </button>
          }
        />
      )}
      {!loading && !error && data && accounts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {accounts.map((acc) => {
            const Icon = segmentIcon(acc.segment);
            const segTitle =
              acc.segment === "CASH" ? t("banking.segmentCash") : t("banking.segmentBank");
            return (
              <div
                key={acc.accountCode}
                className={`${CARD_CONTAINER_CLASS} p-5`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-[#EBEDF0] text-[#2980B9]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 m-0">
                      {segTitle}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 truncate m-0 mt-0.5" title={acc.displayName}>
                      {acc.displayName}
                    </p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5 m-0">{acc.accountCode}</p>
                    <p className="text-xs text-slate-500 font-mono mt-1 m-0">{acc.maskedNumber}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-1 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-500 m-0 mb-1">{t("banking.thNetBalance")}</p>
                  {acc.balances.map((b) => (
                    <p
                      key={`${acc.accountCode}-${b.currency}`}
                      className="m-0 text-right text-sm tabular-nums font-semibold text-slate-900"
                    >
                      {formatBalanceLine(b.amount, b.currency)}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {createBankOpen ? (
        <CreateBankAccountModal
          onClose={() => setCreateBankOpen(false)}
          onCreated={() => {
            setCreateBankOpen(false);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function BankingImportCenter({
  onImported,
}: {
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [bankName, setBankName] = useState("Pasha Bank");
  const [importChannel, setImportChannel] = useState<"BANK" | "CASH">("BANK");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const loadSyncStatus = useCallback(async () => {
    if (!token) {
      setSyncStatus(null);
      return;
    }
    const res = await apiFetch("/api/banking/sync/status");
    if (res.ok) {
      setSyncStatus((await res.json()) as SyncStatus);
    }
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadSyncStatus();
  }, [loadSyncStatus, ready, token]);

  async function runDirectSync() {
    if (!token) return;
    setSyncLoading(true);
    const res = await apiFetch("/api/banking/sync", { method: "POST" });
    setSyncLoading(false);
    if (!res.ok) {
      const txt = await res.text();
      alert(`${t("banking.syncFail")}: ${res.status} ${txt}`);
    } else {
      alert(t("banking.syncDone"));
    }
    await loadSyncStatus();
    onImported();
  }

  async function uploadCsv(file: File) {
    if (!token || !bankName.trim()) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xml")) {
      alert(t("banking.importXmlNotSupported"));
      return;
    }
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("bankName", bankName.trim());
    fd.append("channel", importChannel);
    const res = await apiFetch("/api/banking/import", {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const txt = await res.text();
      const msg = `${res.status} ${txt}`;
      toast.error(t("banking.importErr"), { description: msg });
      setError(msg);
      return;
    }
    onImported();
  }

  function onDropFiles(fileList: FileList | null) {
    const f = fileList?.[0];
    if (f) void uploadCsv(f);
  }

  if (!ready || !token) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900 m-0">{t("banking.importStatementsTitle")}</h3>
        <button
          type="button"
          disabled={syncLoading}
          onClick={() => void runDirectSync()}
          className={`${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}
        >
          {syncLoading ? t("banking.syncRunning") : t("banking.syncBtn")}
        </button>
      </div>
      <p className="text-sm text-slate-600 m-0">{t("banking.importStatementsHint")}</p>
      {syncStatus && (
        <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {t("banking.lastSync")}:{" "}
            {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : t("banking.syncNever")}
          </span>
          {syncStatus.lastSyncStatus === "ok" && (
            <span className="text-emerald-700 font-semibold">{t("banking.syncOk")}</span>
          )}
          {syncStatus.lastSyncStatus === "error" && (
            <span className="text-red-600 font-semibold">{t("banking.syncErr")}</span>
          )}
        </div>
      )}
      {error ? (
        <EmptyState
          title={t("banking.importErr")}
          description={error}
          icon={<Landmark className="h-8 w-8" aria-hidden />}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-gray-700">
          {t("banking.bank")}
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("banking.importChannel")}
          <select
            value={importChannel}
            onChange={(e) => setImportChannel(e.target.value as "BANK" | "CASH")}
            className={FORM_INPUT_CLASS}
          >
            <option value="BANK">{t("banking.filterBank")}</option>
            <option value="CASH">{t("banking.filterCash")}</option>
          </select>
        </label>
      </div>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          onDropFiles(e.dataTransfer.files);
        }}
        className={`rounded-[2px] border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragActive
            ? "border-[#2980B9] bg-[#EBEDF0]"
            : "border-[#D5DADF] bg-[#F8F9FA] hover:border-[#2980B9]/60"
        }`}
      >
        <Landmark className="mx-auto h-10 w-10 text-[#2980B9] mb-3" aria-hidden />
        <p className="text-sm font-medium text-slate-800 m-0">{t("banking.importDropHint")}</p>
        <p className="text-xs text-slate-500 mt-2 m-0">{t("banking.uploadHint")}</p>
        <label className={`mt-4 inline-flex cursor-pointer ${PRIMARY_BUTTON_CLASS} disabled:opacity-50`}>
          <input
            type="file"
            accept=".csv,.xml,text/csv,application/xml,text/xml"
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              onDropFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {uploading ? t("banking.uploadHint") : t("banking.importCsv")}
        </label>
      </div>
    </div>
  );
}

function BankingRegistry({
  refreshKey,
  onTreasuryChanged,
}: {
  refreshKey: number;
  onTreasuryChanged: () => void;
}) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [lines, setLines] = useState<BankLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [candidatesByLine, setCandidatesByLine] = useState<
    Record<string, Candidate[] | "loading" | "error">
  >({});

  const now = new Date();
  const defaultTo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const defaultFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  const load = useCallback(async () => {
    if (!token) {
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/banking/lines?channel=BANK&bankOnly=true");
    if (!res.ok) {
      const detail = String(res.status);
      toast.error(t("banking.loadErr"), { description: detail });
      setError(detail);
      setLines([]);
    } else {
      const data = (await res.json()) as BankLine[];
      setLines(data);
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token, refreshKey]);

  const filteredLines = useMemo(() => {
    return lines.filter((r) => {
      const d = isoDateFromRow(r.valueDate);
      if (!d) return true;
      return d >= dateFrom && d <= dateTo;
    });
  }, [lines, dateFrom, dateTo]);

  async function loadCandidates(lineId: string) {
    if (!token) return;
    setCandidatesByLine((m) => ({ ...m, [lineId]: "loading" }));
    const res = await apiFetch(`/api/banking/lines/${lineId}/candidates`);
    if (!res.ok) {
      setCandidatesByLine((m) => ({ ...m, [lineId]: "error" }));
      return;
    }
    const data = (await res.json()) as { candidates: Candidate[] };
    setCandidatesByLine((m) => ({ ...m, [lineId]: data.candidates ?? [] }));
  }

  async function match(lineId: string, invoiceId: string) {
    if (!token) return;
    const res = await apiFetch(`/api/banking/lines/${lineId}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    if (!res.ok) {
      const txt = await res.text();
      alert(`${t("banking.matchErr")}: ${res.status} ${txt}`);
      return;
    }
    setCandidatesByLine((m) => {
      const next = { ...m };
      delete next[lineId];
      return next;
    });
    await load();
  }

  return (
    <section className="space-y-4">
      <h3 className="text-base font-semibold text-gray-900 m-0">{t("banking.recentTransactionsTitle")}</h3>

      <p className="text-sm text-slate-600 m-0">
        {t("banking.cashOpsMovedHint")}{" "}
        <Link href="/banking/cash" className="font-medium text-action hover:underline">
          {t("nav.kassa")}
        </Link>
        {" · "}
        <Link href="/banking/money" className="font-medium text-action hover:underline">
          {t("treasury.moneyTitle")}
        </Link>
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">
          <span className="block mb-1">{t("banking.periodFrom")}</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="block mb-1">{t("banking.periodTo")}</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </label>
      </div>

      {loading && <p className="text-[#7F8C8D] text-[13px]">{t("banking.loadingLines")}</p>}
      {!loading && filteredLines.length === 0 && !error && (
        <p className="text-[#7F8C8D] text-[13px]">{t("banking.noLines")}</p>
      )}
      {!loading && error ? (
        <EmptyState
          title={t("banking.loadErr")}
          description={error}
          icon={<Landmark className="h-8 w-8" aria-hidden />}
        />
      ) : null}
      {!loading && filteredLines.length > 0 && (
        <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left">
                <th className="py-2.5 px-3 font-semibold text-slate-800">{t("banking.thDate")}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-800">{t("banking.thSource")}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-800">{t("banking.thCounterparty")}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-800">{t("banking.thDescription")}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-800 text-right">
                  {t("banking.thAmountInOut")}
                </th>
                <th className="py-2.5 px-3 font-semibold text-slate-800">{t("banking.thStatus")}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-800">{t("banking.thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.map((r) => {
                const amt = Number(
                  String(r.amount ?? "")
                    .replace(/\s/g, "")
                    .replace(",", "."),
                );
                const isIn = r.type === "INFLOW";
                const signed = isIn ? amt : -amt;
                return (
                  <tr key={r.id} className="border-b border-slate-50 align-top">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-800">
                      {r.valueDate ? String(r.valueDate).slice(0, 10) : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                        {t(sourceLabelKey(r.origin))}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2 min-w-[8rem]">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                          <Building2 className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="text-slate-800 break-words">
                          {r.counterpartyTaxId ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 max-w-md">
                      {r.description ?? r.bankStatement.bankName}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right tabular-nums font-medium ${
                        signed >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      <span className="block">
                        {isIn ? t("banking.income") : t("banking.expense")} · {formatMoneyAzn(r.amount)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {r.isMatched ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          {t("banking.statusPosted")}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                          {t("banking.statusPending")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {!r.isMatched && r.type === "INFLOW" && (
                        <div className="space-y-2 max-w-md">
                          <button
                            type="button"
                            className="text-sm px-2 py-1 rounded-md border border-slate-200 hover:border-action/50 hover:bg-action/10"
                            onClick={() => void loadCandidates(r.id)}
                          >
                            {t("banking.candidates")}
                          </button>
                          {candidatesByLine[r.id] === "loading" && (
                            <span className="text-xs text-slate-500">{t("banking.candidatesLoading")}</span>
                          )}
                          {candidatesByLine[r.id] === "error" && (
                            <span className="text-xs text-red-600">{t("banking.candidatesErr")}</span>
                          )}
                          {Array.isArray(candidatesByLine[r.id]) &&
                            (candidatesByLine[r.id] as Candidate[]).length === 0 && (
                              <p className="text-xs text-slate-500 m-0">{t("banking.noCandidates")}</p>
                            )}
                          {Array.isArray(candidatesByLine[r.id]) &&
                            (candidatesByLine[r.id] as Candidate[]).map((c) => (
                              <div key={c.id} className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-sm text-gray-700">
                                  {c.number} · {c.counterparty.name} · {formatMoneyAzn(c.totalAmount)}
                                </span>
                                <button
                                  type="button"
                                  className="text-sm px-2 py-1 rounded-md bg-action text-white hover:bg-action-hover"
                                  onClick={() => void match(r.id, c.id)}
                                >
                                  {t("banking.match")}
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OutboundPaymentsSection({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<OutboundDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fromAccountIban, setFromAccountIban] = useState("");
  const [recipientIban, setRecipientIban] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("AZN");
  const [purpose, setPurpose] = useState("");
  const [provider, setProvider] = useState("pasha");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch("/api/banking/payment-drafts");
    if (res.ok) {
      setRows((await res.json()) as OutboundDraft[]);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [ready, token, load, refreshKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const normalizedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      toast.error("Некорректная сумма");
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/banking/payment-drafts/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAccountIban: fromAccountIban.trim(),
        recipientIban: recipientIban.trim(),
        amount: normalizedAmount,
        currency: currency.trim().toUpperCase(),
        purpose: purpose.trim(),
        provider: provider.trim(),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const txt = await res.text();
      toast.error("Не удалось отправить в банк", { description: `${res.status} ${txt}` });
      return;
    }
    toast.success("Платеж отправлен в банк");
    setRecipientIban("");
    setAmount("");
    setPurpose("");
    await load();
  }

  if (!ready || !token) return null;

  return (
    <section className={`${CARD_CONTAINER_CLASS} p-6 space-y-5`}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 m-0">Исходящие платежи</h3>
      </div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void submit(e)}>
        <input
          className={FORM_INPUT_CLASS}
          placeholder="IBAN списания"
          value={fromAccountIban}
          onChange={(e) => setFromAccountIban(e.target.value)}
          required
        />
        <input
          className={FORM_INPUT_CLASS}
          placeholder="IBAN получателя"
          value={recipientIban}
          onChange={(e) => setRecipientIban(e.target.value)}
          required
        />
        <input
          className={FORM_INPUT_CLASS}
          placeholder="Сумма"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <select className={FORM_INPUT_CLASS} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="AZN">AZN</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
        <input
          className={`${FORM_INPUT_CLASS} md:col-span-2`}
          placeholder="Назначение платежа"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          required
        />
        <select className={FORM_INPUT_CLASS} value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="pasha">Pasha</option>
          <option value="abb">ABB</option>
          <option value="birbank">Birbank</option>
        </select>
        <div className="flex items-center">
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
            {busy ? t("common.loading") : "Отправить в банк"}
          </button>
        </div>
      </form>
      {loading ? <p className="text-sm text-slate-600 m-0">{t("common.loading")}</p> : null}
      {!loading && (
        <div className={`overflow-x-auto ${CARD_CONTAINER_CLASS}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left">
                <th className="py-2.5 px-3">Дата</th>
                <th className="py-2.5 px-3">Получатель</th>
                <th className="py-2.5 px-3">Назначение</th>
                <th className="py-2.5 px-3">Провайдер</th>
                <th className="py-2.5 px-3 text-right">Сумма</th>
                <th className="py-2.5 px-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-2.5 px-3">{String(r.createdAt).slice(0, 10)}</td>
                  <td className="py-2.5 px-3 font-mono text-xs">{r.recipientIban}</td>
                  <td className="py-2.5 px-3">{r.purpose}</td>
                  <td className="py-2.5 px-3">{r.provider ?? "—"}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatMoneyAzn(Number(r.amount))} {r.currency}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                      {r.status}
                    </span>
                    {r.rejectionReason ? (
                      <div className="text-xs text-rose-700 mt-1">{r.rejectionReason}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function BankingPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [quickExpenseOpen, setQuickExpenseOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"registry" | "outbound">("registry");

  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;
  return (
    <SubscriptionPaywall module="bankingPro">
      <div className="space-y-10 max-w-6xl mx-auto">
        <PageHeader
          title={t("banking.title")}
          actions={
            <>
              <Link href="/invoices?pay=1" className={SECONDARY_BUTTON_CLASS}>
                {t("banking.quickPay")}
              </Link>
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => setQuickExpenseOpen(true)}
              >
                {t("banking.quickExpense")}
              </button>
              <Link href="/settings/mapping" className={PRIMARY_BUTTON_CLASS}>
                {t("banking.addAccount")}
              </Link>
            </>
          }
        />

        <CashAccountCards refreshKey={refreshKey} segmentFilter="BANK" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={activeTab === "registry" ? PRIMARY_BUTTON_CLASS : SECONDARY_BUTTON_CLASS}
            onClick={() => setActiveTab("registry")}
          >
            Выписки и сверка
          </button>
          <button
            type="button"
            className={activeTab === "outbound" ? PRIMARY_BUTTON_CLASS : SECONDARY_BUTTON_CLASS}
            onClick={() => setActiveTab("outbound")}
          >
            Исходящие платежи
          </button>
        </div>

        <section className={`${CARD_CONTAINER_CLASS} p-6`}>
          <BankingImportCenter
            onImported={() => {
              bump();
            }}
          />
        </section>

        {activeTab === "registry" ? (
          <BankingRegistry refreshKey={refreshKey} onTreasuryChanged={bump} />
        ) : (
          <OutboundPaymentsSection refreshKey={refreshKey} />
        )}

        {quickExpenseOpen && (
          <BankingQuickExpenseModal
            onClose={() => setQuickExpenseOpen(false)}
            onDone={bump}
          />
        )}
      </div>
    </SubscriptionPaywall>
  );
}
