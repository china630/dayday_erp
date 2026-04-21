"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
  const canEdit = user?.role === "OWNER" || user?.role === "ADMIN";

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
    if (!token || !canEdit) return;
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
    if (!file || !token || !canEdit) return;
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

  if (!ready || !token) {
    return <p className="text-sm text-[#7F8C8D]">{t("common.loading")}</p>;
  }

  if (!canEdit) {
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
                  disabled={saving}
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
                />
              </label>
              <label className="block text-[#34495E] text-sm">
                {t("orgSettings.phone")}
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`block mt-1 w-full max-w-md ${INPUT_BORDERED_CLASS}`}
                />
              </label>
              <label className="block text-[#34495E] text-sm">
                {t("orgSettings.legalAddress")}
                <textarea
                  value={legalAddress}
                  onChange={(e) => setLegalAddress(e.target.value)}
                  rows={3}
                  className={`block mt-1 w-full max-w-2xl ${INPUT_BORDERED_CLASS}`}
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
                />
                <span>
                  <strong className="text-[#34495E]">FIFO</strong> — {t("orgSettings.valuationFifo")}
                </span>
              </label>
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
                    <input
                      value={b.iban}
                      onChange={(e) => {
                        const next = [...banks];
                        next[idx] = { ...b, iban: e.target.value };
                        setBanks(next);
                      }}
                      className={`block mt-1 w-full ${INPUT_BORDERED_CLASS}`}
                    />
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
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASS}>
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
