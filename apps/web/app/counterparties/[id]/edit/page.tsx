"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { inputFieldClass } from "../../../../lib/form-classes";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

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
  const [voenCheckBusy, setVoenCheckBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

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
    // 1) MDM lookup (GlobalCounterparty)
    const mdm = await apiFetch(
      `/api/counterparties/global/by-voen/${encodeURIComponent(digits)}`,
    );
    if (mdm.ok) {
      const g = (await mdm.json()) as {
        taxId: string;
        name: string;
        legalAddress?: string | null;
        vatStatus?: boolean | null;
      } | null;
      setVoenCheckBusy(false);
      if (g) {
        setName(g.name);
        setIsVatPayer(g.vatStatus ?? null);
        if (g.legalAddress?.trim()) {
          setAddress((a) => (a.trim() ? a : g.legalAddress!));
        }
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
    const j = (await res.json()) as {
      name: string;
      isVatPayer: boolean;
      address: string | null;
    };
    setName(j.name);
    setIsVatPayer(j.isVatPayer);
    if (j.address?.trim()) {
      setAddress((a) => (a.trim() ? a : j.address!));
    }
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
    <div className="space-y-6 max-w-xl">
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

      {loadErr && <p className="text-red-600 text-sm">{loadErr}</p>}

      <form noValidate onSubmit={(e) => void onSubmit(e)} className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 grid gap-4">
        <div>
          <span className={lbl}>{t("counterparties.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.taxId")}</span>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              inputMode="numeric"
              maxLength={10}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))}
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
    </div>
  );
}
