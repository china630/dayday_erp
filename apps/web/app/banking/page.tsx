"use client";

import Link from "next/link";
import { Building2, Landmark, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ModulePageLinks } from "../../components/module-page-links";
import { EmptyState } from "../../components/empty-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { formatMoneyAzn } from "../../lib/format-money";
import { FORM_INPUT_CLASS } from "../../lib/form-styles";
import {
  CARD_CONTAINER_CLASS,
  FILTER_ACTIVE_CLASS,
  FILTER_IDLE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { ledgerQueryParam, useLedger } from "../../lib/ledger-context";
import { useRequireAuth } from "../../lib/use-require-auth";

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

type RegistryFilter = "ALL" | "BANK" | "CASH";

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
    default:
      return "banking.sourceOther";
  }
}

function CashAccountCards({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ledgerType, ready: ledgerReady } = useLedger();
  const [data, setData] = useState<AccountCardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      {!loading && !error && data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.accounts.map((acc) => {
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
  registryFilter,
  onRegistryFilter,
  refreshKey,
  onTreasuryChanged,
}: {
  registryFilter: RegistryFilter;
  onRegistryFilter: (f: RegistryFilter) => void;
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

  const [cashAmount, setCashAmount] = useState("");
  const [cashDesc, setCashDesc] = useState("");
  const [cashDate, setCashDate] = useState(defaultTo);
  const [cashBusy, setCashBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const q =
      registryFilter === "ALL"
        ? ""
        : `?channel=${registryFilter}`;
    const res = await apiFetch(`/api/banking/lines${q}`);
    if (!res.ok) {
      const detail = String(res.status);
      toast.error(t("banking.loadErr"), { description: detail });
      setError(detail);
      setLines([]);
    } else {
      setLines(await res.json());
    }
    setLoading(false);
  }, [token, t, registryFilter]);

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

  async function submitCashOut(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const n = Number(cashAmount);
    if (!Number.isFinite(n) || n <= 0) return;
    setCashBusy(true);
    const res = await apiFetch("/api/banking/cash-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: n,
        description: cashDesc.trim() || undefined,
        date: cashDate || undefined,
      }),
    });
    setCashBusy(false);
    if (!res.ok) {
      alert(`${t("banking.cashOutErr")}: ${await res.text()}`);
      return;
    }
    setCashAmount("");
    setCashDesc("");
    onTreasuryChanged();
    await load();
  }

  const filterBtn =
    "rounded-[2px] px-3 py-1.5 text-[13px] font-medium border transition-colors";

  return (
    <section className="space-y-4">
      <h3 className="text-base font-semibold text-gray-900 m-0">{t("banking.recentTransactionsTitle")}</h3>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">{t("banking.registryFilter")}:</span>
        <button
          type="button"
          className={`${filterBtn} ${registryFilter === "ALL" ? FILTER_ACTIVE_CLASS : FILTER_IDLE_CLASS}`}
          onClick={() => onRegistryFilter("ALL")}
        >
          {t("banking.filterAll")}
        </button>
        <button
          type="button"
          className={`${filterBtn} ${registryFilter === "BANK" ? FILTER_ACTIVE_CLASS : FILTER_IDLE_CLASS}`}
          onClick={() => onRegistryFilter("BANK")}
        >
          {t("banking.filterBank")}
        </button>
        <button
          type="button"
          className={`${filterBtn} ${registryFilter === "CASH" ? FILTER_ACTIVE_CLASS : FILTER_IDLE_CLASS}`}
          onClick={() => onRegistryFilter("CASH")}
        >
          {t("banking.filterCash")}
        </button>
      </div>

      <form
        onSubmit={(e) => void submitCashOut(e)}
        className={`${CARD_CONTAINER_CLASS} p-4 flex flex-wrap items-end gap-3`}
      >
        <p className="text-sm font-medium text-slate-800 w-full m-0">{t("banking.cashOutTitle")}</p>
        <label className="text-sm text-slate-700 min-w-[7rem]">
          <span className="block mb-1">{t("banking.cashOutAmount")}</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={cashAmount}
            onChange={(e) => setCashAmount(e.target.value)}
            className={FORM_INPUT_CLASS}
            required
          />
        </label>
        <label className="text-sm text-slate-700 flex-1 min-w-[10rem]">
          <span className="block mb-1">{t("banking.cashOutDesc")}</span>
          <input
            value={cashDesc}
            onChange={(e) => setCashDesc(e.target.value)}
            className={FORM_INPUT_CLASS}
            placeholder={t("banking.cashOutDescPh")}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="block mb-1">{t("banking.cashOutDate")}</span>
          <input
            type="date"
            value={cashDate}
            onChange={(e) => setCashDate(e.target.value)}
            className={FORM_INPUT_CLASS}
          />
        </label>
        <button
          type="submit"
          disabled={cashBusy}
          className={PRIMARY_BUTTON_CLASS}
        >
          {cashBusy ? "…" : t("banking.cashOutBtn")}
        </button>
      </form>

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

export default function BankingPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [registryFilter, setRegistryFilter] = useState<RegistryFilter>("ALL");
  const [refreshKey, setRefreshKey] = useState(0);

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
    <div className="space-y-10 max-w-6xl mx-auto">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/invoices", labelKey: "nav.invoices" },
          { href: "/reporting", labelKey: "nav.reportingHub" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-[#34495E] m-0">{t("banking.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/invoices" className={SECONDARY_BUTTON_CLASS}>
            {t("banking.quickPay")}
          </Link>
          <Link href="/expenses/quick" className={SECONDARY_BUTTON_CLASS}>
            {t("banking.quickExpense")}
          </Link>
          <Link href="/settings/mapping" className={PRIMARY_BUTTON_CLASS}>
            {t("banking.addAccount")}
          </Link>
        </div>
      </div>

      <CashAccountCards refreshKey={refreshKey} />

      <section className={`${CARD_CONTAINER_CLASS} p-6`}>
        <BankingImportCenter
          onImported={() => {
            bump();
          }}
        />
      </section>

      <BankingRegistry
        registryFilter={registryFilter}
        onRegistryFilter={setRegistryFilter}
        refreshKey={refreshKey}
        onTreasuryChanged={bump}
      />
    </div>
  );
}
