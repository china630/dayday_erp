"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { safeJson } from "../../../../lib/api-fetch";
import { inputFieldClass } from "../../../../lib/form-classes";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

type ReconJournalLine = {
  journalEntryId: string | null;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
};

type ReconTransaction = {
  id: string;
  date: string;
  transactionId: string | null;
  kind: string;
  reference: string;
  description: string;
  currency: string | null;
  journalLines: ReconJournalLine[];
  runningBalance: string;
};

type ReconPayload = {
  openingBalance: string;
  closingBalance: string;
  openingBalanceDetail?: { currency: string; side: string; signedAmount: string };
  dateFrom: string;
  dateTo: string;
  transactions: ReconTransaction[];
  methodologyNote?: string;
};

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  return { start, end };
}

type Row = {
  id: string;
  name: string;
  taxId: string;
  kind: string;
  role: string;
  email: string | null;
  address: string | null;
  isVatPayer?: boolean | null;
};

export default function EditCounterpartyPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [kind, setKind] = useState<"LEGAL_ENTITY" | "INDIVIDUAL">("LEGAL_ENTITY");
  const [role, setRole] = useState<"CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER">("CUSTOMER");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [isVatPayer, setIsVatPayer] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nameLockedByLookup, setNameLockedByLookup] = useState(false);
  const [voenCheckBusy, setVoenCheckBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "reconciliation">("edit");
  const [{ start: periodStart, end: periodEnd }, setPeriod] = useState(defaultPeriod);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [reconBusy, setReconBusy] = useState(false);
  const [reconErr, setReconErr] = useState<string | null>(null);
  const [recon, setRecon] = useState<ReconPayload | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoadErr(null);
    const res = await apiFetch(`/api/counterparties/${id}`);
    if (!res.ok) {
      setLoadErr(`${t("counterparties.loadErr")}: ${res.status}`);
      return;
    }
    const r = (await res.json()) as Row;
    setName(r.name);
    setTaxId(r.taxId);
    setKind(r.kind as "LEGAL_ENTITY" | "INDIVIDUAL");
    setRole(r.role as "CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER");
    setAddress(r.address ?? "");
    setEmail(r.email ?? "");
    setIsVatPayer(r.isVatPayer ?? null);
  }, [id, t, token]);

  useEffect(() => {
    if (!ready || !token || !id) return;
    void load();
  }, [load, ready, token, id]);

  async function checkVoen() {
    if (!token) return;
    const digits = taxId.replace(/\D/g, "");
    if (digits.length !== 10) {
      alert(t("counterparties.taxInvalid"));
      return;
    }
    setVoenCheckBusy(true);
    setMsg(null);
    let hasLookupData = false;
    // 1) MDM lookup (GlobalCounterparty)
    const mdm = await apiFetch(
      `/api/counterparties/global/by-voen/${encodeURIComponent(digits)}`,
    );
    if (mdm.ok) {
      const g = await safeJson<{
        taxId: string;
        name: string;
        legalAddress?: string | null;
        vatStatus?: boolean | null;
      }>(mdm);
      setVoenCheckBusy(false);
      if (g) {
        hasLookupData = true;
        setName(g.name);
        setIsVatPayer(g.vatStatus ?? null);
        if (g.legalAddress?.trim()) {
          setAddress((a) => (a.trim() ? a : g.legalAddress!));
        }
        setNameLockedByLookup(hasLookupData);
        return;
      }
    }

    // 2) External lookup fallback (e-taxes)
    const res = await apiFetch(
      `/api/tax/taxpayer-info?voen=${encodeURIComponent(digits)}`,
    );
    setVoenCheckBusy(false);
    if (!res.ok) {
      setMsg(`${t("counterparties.voenCheckErr")}: ${res.status} ${await res.text()}`);
      return;
    }
    const j = await safeJson<{
      name: string;
      isVatPayer: boolean;
      address: string | null;
    }>(res);
    if (!j) {
      setMsg(`${t("counterparties.voenCheckErr")}: empty response`);
      return;
    }
    hasLookupData = true;
    setName(j.name);
    setIsVatPayer(j.isVatPayer);
    if (j.address?.trim()) {
      setAddress((a) => (a.trim() ? a : j.address!));
    }
    setNameLockedByLookup(hasLookupData);
  }

  useEffect(() => {
    const digits = taxId.replace(/\D/g, "");
    if (digits.length !== 10) {
      setNameLockedByLookup(false);
      return;
    }
    void checkVoen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxId]);

  const flatReconRows = useMemo(() => {
    if (!recon?.transactions) return [];
    const rows: Array<
      ReconJournalLine & { date: string; reference: string; kind: string; runningBalance: string }
    > = [];
    for (const tx of recon.transactions) {
      for (const jl of tx.journalLines) {
        rows.push({
          ...jl,
          date: tx.date,
          reference: tx.reference,
          kind: tx.kind,
          runningBalance: tx.runningBalance,
        });
      }
    }
    return rows;
  }, [recon]);

  async function loadReconciliation() {
    if (!token || !id) return;
    setReconBusy(true);
    setReconErr(null);
    const q = new URLSearchParams({
      startDate: periodStart,
      endDate: periodEnd,
    });
    if (currencyFilter.trim()) q.set("currency", currencyFilter.trim().toUpperCase());
    const res = await apiFetch(`/api/reports/reconciliation/${id}?${q.toString()}`);
    setReconBusy(false);
    if (!res.ok) {
      setReconErr(`${t("counterparties.reconLoadErr")}: ${res.status}`);
      setRecon(null);
      return;
    }
    const j = await safeJson<ReconPayload>(res);
    setRecon(j);
  }

  async function downloadRecon(kind: "pdf" | "xlsx") {
    if (!token || !id) return;
    const q = new URLSearchParams({ startDate: periodStart, endDate: periodEnd });
    if (currencyFilter.trim()) q.set("currency", currencyFilter.trim().toUpperCase());
    const path =
      kind === "pdf"
        ? `/api/reports/reconciliation/${id}/pdf?${q}`
        : `/api/reports/reconciliation/${id}/xlsx?${q}`;
    const res = await apiFetch(path);
    if (!res.ok) {
      alert(`${t("counterparties.reconExportErr")}: ${res.status}`);
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition");
    const m = cd?.match(/filename="([^"]+)"/);
    const fallback =
      kind === "pdf" ? `reconciliation-${periodStart}-${periodEnd}.pdf` : `reconciliation-${periodStart}-${periodEnd}.xlsx`;
    const filename = m?.[1] ?? fallback;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function emailReconciliation() {
    if (!token || !id) return;
    const q = new URLSearchParams({ startDate: periodStart, endDate: periodEnd });
    if (currencyFilter.trim()) q.set("currency", currencyFilter.trim().toUpperCase());
    setReconBusy(true);
    setReconErr(null);
    const res = await apiFetch(`/api/reports/reconciliation/${id}/email?${q.toString()}`, {
      method: "POST",
    });
    setReconBusy(false);
    if (!res.ok) {
      const text = await res.text();
      setReconErr(`${t("counterparties.reconEmailErr")}: ${res.status} ${text}`);
      return;
    }
    alert(t("counterparties.reconEmailOk"));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!token || !id) return;
    if (!name.trim()) {
      alert(t("counterparties.nameRequired", { defaultValue: "Укажите название" }));
      return;
    }
    const digits = taxId.replace(/\D/g, "");
    if (digits.length !== 10) {
      alert(t("counterparties.taxInvalid"));
      return;
    }
    setBusy(true);
    const body = {
      name: name.trim(),
      taxId: digits,
      kind,
      role,
      address: address.trim() || undefined,
      email: email.trim() || undefined,
      ...(isVatPayer !== null && { isVatPayer }),
    };
    const res = await apiFetch(`/api/counterparties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(`${t("counterparties.updateErr")}: ${await res.text()}`);
      return;
    }
    router.push("/counterparties");
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-6 max-w-5xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/counterparties", labelKey: "nav.counterparties" },
          { href: "/invoices", labelKey: "nav.invoices" },
        ]}
      />
      <div>
        <Link href="/counterparties" className="text-sm text-action hover:text-primary">
          ← {t("counterparties.backList")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("counterparties.editPageTitle")}</h1>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "edit" ? "bg-action text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {t("counterparties.tabEdit")}
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("reconciliation");
            void loadReconciliation();
          }}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "reconciliation"
              ? "bg-action text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {t("counterparties.tabReconciliation")}
        </button>
      </div>

      {loadErr && <p className="text-red-600 text-sm">{loadErr}</p>}

      {tab === "reconciliation" && (
        <div className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 space-y-4">
          <p className="text-sm text-slate-600">{t("counterparties.reconSubtitle")}</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <span className={lbl}>{t("counterparties.reconStart")}</span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
                className={inputFieldClass}
              />
            </div>
            <div>
              <span className={lbl}>{t("counterparties.reconEnd")}</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
                className={inputFieldClass}
              />
            </div>
            <div>
              <span className={lbl}>{t("counterparties.reconCurrency")}</span>
              <input
                placeholder="AZN"
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value.toUpperCase())}
                className={`${inputFieldClass} w-28 uppercase`}
              />
            </div>
            <button
              type="button"
              disabled={reconBusy}
              onClick={() => void loadReconciliation()}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 disabled:opacity-50"
            >
              {reconBusy ? "…" : t("counterparties.reconLoad")}
            </button>
          </div>
          {reconErr && <p className="text-red-600 text-sm">{reconErr}</p>}
          {recon && (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-slate-500">{t("counterparties.reconOpening")}: </span>
                  <span className="font-semibold tabular-nums">{recon.openingBalance}</span>
                  {recon.openingBalanceDetail?.currency && (
                    <span className="text-slate-500 ml-1">{recon.openingBalanceDetail.currency}</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">{t("counterparties.reconClosing")}: </span>
                  <span className="font-semibold tabular-nums">{recon.closingBalance}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={reconBusy}
                  onClick={() => void downloadRecon("pdf")}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  {t("counterparties.reconPdf")}
                </button>
                <button
                  type="button"
                  disabled={reconBusy}
                  onClick={() => void downloadRecon("xlsx")}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  {t("counterparties.reconXlsx")}
                </button>
                <button
                  type="button"
                  disabled={reconBusy || !email?.trim()}
                  onClick={() => void emailReconciliation()}
                  className="px-3 py-2 rounded-lg border border-action/30 text-sm font-medium text-primary hover:bg-action/10 disabled:opacity-40"
                >
                  {t("counterparties.reconEmail")}
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">{t("counterparties.reconThDate")}</th>
                      <th className="px-3 py-2">{t("counterparties.reconThRef")}</th>
                      <th className="px-3 py-2">{t("counterparties.reconThKind")}</th>
                      <th className="px-3 py-2">{t("counterparties.reconThAccount")}</th>
                      <th className="px-3 py-2 text-right">{t("counterparties.reconThDr")}</th>
                      <th className="px-3 py-2 text-right">{t("counterparties.reconThCr")}</th>
                      <th className="px-3 py-2 text-right">{t("counterparties.reconThBal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatReconRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          {t("counterparties.reconEmpty")}
                        </td>
                      </tr>
                    ) : (
                      flatReconRows.map((row, idx) => (
                        <tr key={`${row.journalEntryId ?? "s"}-${idx}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-2">{row.reference}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{row.kind}</td>
                          <td className="px-3 py-2">
                            <div className="font-mono text-xs">{row.accountCode}</div>
                            <div className="text-slate-600 text-xs">{row.accountName}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.debit}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.credit}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{row.runningBalance}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {recon.methodologyNote && (
                <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">{recon.methodologyNote}</p>
              )}
            </>
          )}
        </div>
      )}

      {tab === "edit" && (
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 grid gap-4">
        <div>
          <span className={lbl}>{t("counterparties.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputFieldClass}
            disabled={nameLockedByLookup}
          />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.taxId")}</span>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              inputMode="numeric"
              maxLength={10}
              value={taxId}
              onChange={(e) => {
                setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10));
                setNameLockedByLookup(false);
              }}
              className={`${inputFieldClass} flex-1 min-w-[140px]`}
            />
            <button
              type="button"
              disabled={voenCheckBusy}
              onClick={() => void checkVoen()}
              className="px-3 py-2 rounded-lg border border-action/25 bg-action/10 text-primary text-sm font-medium hover:bg-action/15 disabled:opacity-50 shrink-0"
            >
              {voenCheckBusy ? "…" : t("counterparties.yoxla")}
            </button>
          </div>
        </div>
        <div className="text-sm text-slate-700">
          <span className="font-medium text-slate-800">{t("counterparties.vatStatus")}: </span>
          {isVatPayer === null
            ? t("counterparties.vatUnknown")
            : isVatPayer
              ? t("counterparties.vatPayerYes")
              : t("counterparties.vatPayerNo")}
        </div>
        <div>
          <span className={lbl}>{t("counterparties.kind")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputFieldClass}>
            <option value="LEGAL_ENTITY">{t("counterparties.kindLegal")}</option>
            <option value="INDIVIDUAL">{t("counterparties.kindIndividual")}</option>
          </select>
        </div>
        <div>
          <span className={lbl}>{t("counterparties.role")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={inputFieldClass}>
            <option value="CUSTOMER">{t("counterparties.roleCustomer")}</option>
            <option value="SUPPLIER">{t("counterparties.roleSupplier")}</option>
            <option value="BOTH">
              {t("counterparties.roleTradingPartner", {
                defaultValue: "Поставщик / Покупатель",
              })}
            </option>
            <option value="OTHER">
              {t("counterparties.roleOther", { defaultValue: "Прочее" })}
            </option>
          </select>
        </div>
        <div>
          <span className={lbl}>{t("counterparties.address")}</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.email")}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputFieldClass} />
        </div>
        {msg && <p className="text-red-600 text-sm">{msg}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !!loadErr}
            className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium disabled:opacity-50"
          >
            {busy ? "…" : t("counterparties.save")}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
