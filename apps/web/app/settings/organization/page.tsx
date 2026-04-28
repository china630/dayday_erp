"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle, Lock, Search } from "lucide-react";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import { validateAzIban } from "../../../lib/iban";

type BankRow = {
  id?: string;
  bankName: string;
  accountNumber: string;
  currency: "AZN" | "USD" | "EUR";
  iban: string;
  swift: string;
};

type OrgSettings = {
  id: string;
  name: string;
  taxId: string;
  legalAddress: string | null;
  phone: string | null;
  directorName: string | null;
  logoUrl: string | null;
  valuationMethod: "AVCO" | "FIFO";
  settings?: {
    ledger?: {
      lockedPeriodUntil?: string | null;
    };
  };
  bankAccountsOrg: Array<{
    id: string;
    bankName: string;
    accountNumber: string;
    currency: string;
    iban: string | null;
    swift: string | null;
  }>;
};

const emptyBank = (): BankRow => ({
  bankName: "",
  accountNumber: "",
  currency: "AZN",
  iban: "",
  swift: "",
});

export default function OrganizationSettingsPage() {
  const { t } = useTranslation();
  const { ready, token } = useRequireAuth();
  const { user } = useAuth();
  const canEditGeneral = user?.role === "OWNER" || user?.role === "ADMIN";
  const canEditPeriodLock = user?.role === "OWNER" || user?.role === "ACCOUNTANT";
  const canOpenPage = canEditGeneral || canEditPeriodLock;

  const [tab, setTab] = useState<"general" | "policy" | "banks">("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [valuationMethod, setValuationMethod] = useState<"AVCO" | "FIFO">("AVCO");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [taxId, setTaxId] = useState("");
  const [banks, setBanks] = useState<BankRow[]>([emptyBank()]);
  const [deepIbanBusyIdx, setDeepIbanBusyIdx] = useState<number | null>(null);
  const [lockedPeriodUntil, setLockedPeriodUntil] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    const res = await apiFetch("/api/organization/settings");
    if (!res.ok) {
      setErr(String(res.status));
      setLoading(false);
      return;
    }
    const o = (await res.json()) as OrgSettings;
    setName(o.name);
    setTaxId(o.taxId);
    setLegalAddress(o.legalAddress ?? "");
    setPhone(o.phone ?? "");
    setDirectorName(o.directorName ?? "");
    setValuationMethod(o.valuationMethod === "FIFO" ? "FIFO" : "AVCO");
    setLogoUrl(o.logoUrl ?? null);
    setLockedPeriodUntil(o.settings?.ledger?.lockedPeriodUntil ?? "");
    setBanks(
      o.bankAccountsOrg?.length
        ? o.bankAccountsOrg.map((b) => ({
            id: b.id,
            bankName: b.bankName,
            accountNumber: b.accountNumber,
            currency: b.currency as BankRow["currency"],
            iban: b.iban ?? "",
            swift: b.swift ?? "",
          }))
        : [emptyBank()],
    );
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [ready, token, load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canEditGeneral) return;
    setSaving(true);
    setErr(null);
    const bankPayload = banks
      .filter((b) => b.bankName.trim() && b.accountNumber.trim())
      .map((b) => ({
        bankName: b.bankName.trim(),
        accountNumber: b.accountNumber.trim(),
        currency: b.currency,
        iban: b.iban.trim() || null,
        swift: b.swift.trim() || null,
      }));
    const res = await apiFetch("/api/organization/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        legalAddress: legalAddress.trim() || null,
        phone: phone.trim() || null,
        directorName: directorName.trim() || null,
        logoUrl: logoUrl || null,
        valuationMethod,
        bankAccounts: bankPayload,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(await res.text());
      toast.error(t("orgSettings.saveErr"));
      return;
    }
    toast.success(t("orgSettings.saveOk"));
    await load();
  }

  async function onLogoChange(file: File | null) {
    if (!file || !token || !canEditGeneral) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch("/api/organization/settings/logo", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      toast.error(t("orgSettings.logoErr"));
      return;
    }
    const j = (await res.json()) as { logoUrl: string };
    setLogoUrl(j.logoUrl);
    toast.success(t("orgSettings.logoOk"));
  }

  async function runDeepIbanValidation(index: number) {
    const row = banks[index];
    if (!row) return;
    const local = validateAzIban(row.iban);
    if (!local.isValid) {
      toast.error(t("orgSettings.ibanInvalidLocal"));
      return;
    }
    setDeepIbanBusyIdx(index);
    try {
      const res = await apiFetch("/api/banking/validate-iban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban: local.normalized }),
      });
      if (res.ok) {
        let bankName: string | null = null;
        let bic: string | null = null;
        try {
          const body = (await res.clone().json()) as {
            bankName?: string | null;
            bic?: string | null;
          };
          bankName = body.bankName ?? null;
          bic = body.bic ?? null;
        } catch {
          /* ignore parse errors for toast details */
        }
        if (bankName) {
          toast.success(
            t("orgSettings.ibanDeepOkDetailed", {
              bank: bankName,
              bic: bic ?? "—",
            }),
          );
        } else {
          toast.success(t("orgSettings.ibanDeepOk"));
        }
        return;
      }
      let code = "";
      try {
        const body = (await res.clone().json()) as { code?: string };
        code = body.code ?? "";
      } catch {
        /* ignore */
      }
      if (res.status === 402 || (res.status === 403 && code === "MODULE_NOT_ENTITLED")) {
        window.dispatchEvent(
          new CustomEvent("dayday:upgrade-modal-custom", {
            detail: {
              title: t("orgSettings.ibanDeepPaywallTitle"),
              body: t("orgSettings.ibanDeepPaywallBody"),
            },
          }),
        );
        return;
      }
      toast.error(t("orgSettings.ibanDeepErr"), { description: `${res.status}` });
    } finally {
      setDeepIbanBusyIdx(null);
    }
  }

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`text-sm font-medium px-3 py-1.5 rounded border ${
        tab === id
          ? "bg-white text-[#34495E] border-[#2980B9]"
          : "bg-transparent text-[#7F8C8D] border-transparent hover:border-[#D5DADF]"
      }`}
    >
      {label}
    </button>
  );

  const title = useMemo(() => t("orgSettings.title"), [t]);

  async function onSavePeriodLock() {
    if (!token || !canEditPeriodLock) return;
    const lockDate = lockedPeriodUntil.trim();
    if (lockDate) {
      const month = lockDate.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(month)) {
        const checkRes = await apiFetch(
          `/api/accounting/period-close/checklist?month=${encodeURIComponent(month)}`,
        );
        if (!checkRes.ok) {
          toast.error(t("orgSettings.periodChecklistErr", { defaultValue: "Не удалось выполнить checklist закрытия периода" }));
          return;
        }
        const checklist = (await checkRes.json()) as {
          allPassed: boolean;
          checks: {
            noDraftInvoices: { ok: boolean; draftCount: number };
            noNegativeStock: { ok: boolean; affectedCount: number };
            noNegativeCash: { ok: boolean; affectedAccounts: string[] };
            depreciationAccruedIfNeeded: { ok: boolean };
          };
        };
        if (!checklist.allPassed) {
          const issues: string[] = [];
          if (!checklist.checks.noDraftInvoices.ok) {
            issues.push(
              t("orgSettings.periodChecklistDraftInvoices", {
                defaultValue: "Есть черновики инвойсов",
              }) + `: ${checklist.checks.noDraftInvoices.draftCount}`,
            );
          }
          if (!checklist.checks.noNegativeStock.ok) {
            issues.push(
              t("orgSettings.periodChecklistNegativeStock", {
                defaultValue: "Есть отрицательные складские остатки",
              }) + `: ${checklist.checks.noNegativeStock.affectedCount}`,
            );
          }
          if (!checklist.checks.noNegativeCash.ok) {
            issues.push(
              t("orgSettings.periodChecklistNegativeCash", {
                defaultValue: "Есть отрицательные денежные остатки",
              }) + `: ${checklist.checks.noNegativeCash.affectedAccounts.join(", ")}`,
            );
          }
          if (!checklist.checks.depreciationAccruedIfNeeded.ok) {
            issues.push(
              t("orgSettings.periodChecklistDepreciation", {
                defaultValue: "Не начислена амортизация при наличии активных ОС",
              }),
            );
          }
          toast.error(
            t("orgSettings.periodChecklistFailed", {
              defaultValue: "Нельзя закрыть период, checklist не пройден",
            }),
            { description: issues.join(" | ") },
          );
          return;
        }
      }
    }
    setSaving(true);
    const res = await apiFetch("/api/organization/settings/period-lock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lockedPeriodUntil: lockedPeriodUntil.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(t("orgSettings.saveErr"));
      return;
    }
    toast.success(t("orgSettings.periodLockSaved"));
    await load();
  }

  if (!ready || !token) {
    return <p className="text-sm text-[#7F8C8D]">{t("common.loading")}</p>;
  }

  if (!canOpenPage) {
    return (
      <div className="space-y-4 max-w-3xl">
        <ModulePageLinks
          items={[{ href: "/", labelKey: "nav.home" }, { href: "/settings/team", labelKey: "nav.team" }]}
        />
        <p className="text-sm text-[#7F8C8D]">{t("orgSettings.noAccess")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/settings/team", labelKey: "nav.team" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-[#34495E]">{title}</h1>
        <p className="text-sm text-[#7F8C8D] mt-1">{t("orgSettings.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[#D5DADF] pb-2">
        {tabBtn("general", t("orgSettings.tabGeneral"))}
        {tabBtn("policy", t("orgSettings.tabPolicy"))}
        {tabBtn("banks", t("orgSettings.tabBanks"))}
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}
      {loading && <p className="text-sm text-[#7F8C8D]">{t("common.loading")}</p>}

      {!loading && (
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
          {tab === "general" && (
            <section className={`${CARD_CONTAINER_CLASS} p-4 space-y-4`}>
              <div>
                <span className="text-xs font-bold text-[#7F8C8D] uppercase tracking-wide block mb-1">
                  {t("orgSettings.logo")}
                </span>
                {logoUrl ? (
                  <img
                    src={
                      logoUrl.startsWith("http")
                        ? logoUrl
                        : `${typeof window !== "undefined" ? window.location.origin : ""}${logoUrl}`
                    }
                    alt=""
                    className="h-16 object-contain mb-2 border border-[#D5DADF] rounded p-1 bg-white"
                  />
                ) : null}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={saving || !canEditGeneral}
                  onChange={(e) => void onLogoChange(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </div>
              <label className="block text-[#34495E] text-sm">
                {t("orgSettings.name")}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`block mt-1 w-full max-w-xl ${INPUT_BORDERED_CLASS}`}
                  required
                  disabled={!canEditGeneral}
                />
              </label>
              <label className="block text-[#34495E] text-sm">
                {t("orgSettings.taxId")}
                <input value={taxId} readOnly className={`block mt-1 w-full max-w-xs ${INPUT_BORDERED_CLASS} bg-slate-50`} />
              </label>
              <label className="block text-[#34495E] text-sm">
                {t("orgSettings.director")}
                <input
                  value={directorName}
                  onChange={(e) => setDirectorName(e.target.value)}
                  className={`block mt-1 w-full max-w-xl ${INPUT_BORDERED_CLASS}`}
                  disabled={!canEditGeneral}
                />
              </label>
              <label className="block text-[#34495E] text-sm">
                {t("orgSettings.phone")}
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`block mt-1 w-full max-w-md ${INPUT_BORDERED_CLASS}`}
                  disabled={!canEditGeneral}
                />
              </label>
              <label className="block text-[#34495E] text-sm">
                {t("orgSettings.legalAddress")}
                <textarea
                  value={legalAddress}
                  onChange={(e) => setLegalAddress(e.target.value)}
                  rows={3}
                  className={`block mt-1 w-full max-w-2xl ${INPUT_BORDERED_CLASS}`}
                  disabled={!canEditGeneral}
                />
              </label>
            </section>
          )}

          {tab === "policy" && (
            <section className={`${CARD_CONTAINER_CLASS} p-4 space-y-3`}>
              <p className="text-sm font-semibold text-[#34495E]">{t("orgSettings.valuationTitle")}</p>
              <label className="flex items-start gap-2 text-sm text-[#34495E]">
                <input
                  type="radio"
                  name="vm"
                  checked={valuationMethod === "AVCO"}
                  onChange={() => setValuationMethod("AVCO")}
                  disabled={!canEditGeneral}
                />
                <span>
                  <strong className="text-[#34495E]">AVCO</strong> — {t("orgSettings.valuationAvco")}
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-[#34495E]">
                <input
                  type="radio"
                  name="vm"
                  checked={valuationMethod === "FIFO"}
                  onChange={() => setValuationMethod("FIFO")}
                  disabled={!canEditGeneral}
                />
                <span>
                  <strong className="text-[#34495E]">FIFO</strong> — {t("orgSettings.valuationFifo")}
                </span>
              </label>
              <div className="border-t border-[#D5DADF] pt-3 mt-3 space-y-2">
                <p className="text-sm font-semibold text-[#34495E]">
                  {t("orgSettings.periodLockTitle")}
                </p>
                <p className="text-xs text-[#7F8C8D]">{t("orgSettings.periodLockHint")}</p>
                <label className="block text-[#34495E] text-sm">
                  {t("orgSettings.periodLockUntil")}
                  <input
                    type="date"
                    value={lockedPeriodUntil}
                    onChange={(e) => setLockedPeriodUntil(e.target.value)}
                    className={`block mt-1 w-full max-w-xs ${INPUT_BORDERED_CLASS}`}
                    disabled={!canEditPeriodLock || saving}
                  />
                </label>
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => void onSavePeriodLock()}
                  disabled={!canEditPeriodLock || saving}
                >
                  {saving ? t("common.loading") : t("orgSettings.periodLockSave")}
                </button>
              </div>
            </section>
          )}

          {tab === "banks" && (
            <section className={`${CARD_CONTAINER_CLASS} p-4 space-y-4`}>
              <p className="text-sm text-[#7F8C8D]">{t("orgSettings.banksHint")}</p>
              {banks.map((b, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 md:grid-cols-2 border border-[#D5DADF] rounded-lg p-3 bg-[#EBEDF0]/30"
                >
                  <label className="text-sm text-[#34495E] md:col-span-2">
                    {t("orgSettings.bankName")}
                    <input
                      value={b.bankName}
                      onChange={(e) => {
                        const next = [...banks];
                        next[idx] = { ...b, bankName: e.target.value };
                        setBanks(next);
                      }}
                      className={`block mt-1 w-full ${INPUT_BORDERED_CLASS}`}
                    />
                  </label>
                  <label className="text-sm text-[#34495E]">
                    {t("orgSettings.accountNumber")}
                    <input
                      value={b.accountNumber}
                      onChange={(e) => {
                        const next = [...banks];
                        next[idx] = { ...b, accountNumber: e.target.value };
                        setBanks(next);
                      }}
                      className={`block mt-1 w-full ${INPUT_BORDERED_CLASS}`}
                    />
                  </label>
                  <label className="text-sm text-[#34495E]">
                    {t("orgSettings.currency")}
                    <select
                      value={b.currency}
                      onChange={(e) => {
                        const next = [...banks];
                        next[idx] = { ...b, currency: e.target.value as BankRow["currency"] };
                        setBanks(next);
                      }}
                      className={`block mt-1 w-full ${INPUT_BORDERED_CLASS}`}
                    >
                      <option value="AZN">AZN</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </label>
                  <label className="text-sm text-[#34495E]">
                    {t("orgSettings.iban")}
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        value={b.iban}
                        onChange={(e) => {
                          const next = [...banks];
                          next[idx] = { ...b, iban: e.target.value.toUpperCase() };
                          setBanks(next);
                        }}
                        onBlur={(e) => {
                          const next = [...banks];
                          next[idx] = {
                            ...b,
                            iban: e.target.value.replace(/\s+/g, "").toUpperCase(),
                          };
                          setBanks(next);
                        }}
                        className={`block w-full ${INPUT_BORDERED_CLASS}`}
                      />
                      {validateAzIban(b.iban).isValid ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" aria-label="IBAN valid" />
                      ) : null}
                    </div>
                  </label>
                  <label className="text-sm text-[#34495E]">
                    {t("orgSettings.swift")}
                    <input
                      value={b.swift}
                      onChange={(e) => {
                        const next = [...banks];
                        next[idx] = { ...b, swift: e.target.value };
                        setBanks(next);
                      }}
                      className={`block mt-1 w-full ${INPUT_BORDERED_CLASS}`}
                    />
                  </label>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      className={SECONDARY_BUTTON_CLASS}
                      onClick={() => void runDeepIbanValidation(idx)}
                      disabled={deepIbanBusyIdx === idx}
                    >
                      <Search className="h-4 w-4" aria-hidden />
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      {deepIbanBusyIdx === idx ? t("common.loading") : t("orgSettings.ibanDeepCheck")}
                    </button>
                  </div>
                  <div className="md:col-span-2">
                    <p className="rounded-[2px] border border-[#D5DADF] bg-[#EBEDF0]/40 p-2 text-xs text-[#34495E]">
                      {t("orgSettings.ibanHint")}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      className={SECONDARY_BUTTON_CLASS}
                      onClick={() => setBanks((rows) => rows.filter((_, i) => i !== idx))}
                    >
                      {t("orgSettings.removeBank")}
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => setBanks((rows) => [...rows, emptyBank()])}
              >
                {t("orgSettings.addBank")}
              </button>
            </section>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !canEditGeneral}
              className={PRIMARY_BUTTON_CLASS}
            >
              {saving ? t("common.loading") : t("common.save")}
            </button>
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => void load()}>
              {t("common.refresh")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
