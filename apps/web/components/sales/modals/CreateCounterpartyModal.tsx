"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle, Lock, Search } from "lucide-react";
import { apiFetch } from "../../../lib/api-client";
import { safeJson } from "../../../lib/api-fetch";
import { notifyListRefresh } from "../../../lib/list-refresh-bus";
import { inputFieldClass } from "../../../lib/form-classes";
import { validateAzIban } from "../../../lib/iban";
import { SalesModalFooter, SalesModalShell } from "./modal-shell";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

export function CreateCounterpartyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [kind, setKind] = useState<"LEGAL_ENTITY" | "INDIVIDUAL">("LEGAL_ENTITY");
  const [role, setRole] = useState<"CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER">("CUSTOMER");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [iban, setIban] = useState("");
  const [isVatPayer, setIsVatPayer] = useState<boolean | null>(null);
  const [isRiskyTaxpayer, setIsRiskyTaxpayer] = useState<boolean | null>(null);
  const [nameLockedByLookup, setNameLockedByLookup] = useState(false);
  const [voenCheckBusy, setVoenCheckBusy] = useState(false);
  const [ibanDeepBusy, setIbanDeepBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const lastAutoLookup = useRef<string>("");

  const digits = useMemo(() => taxId.replace(/\D/g, ""), [taxId]);
  const taxValid = digits.length === 10;

  async function checkVoen({ allowFallback }: { allowFallback: boolean }) {
    const d = digits;
    if (d.length !== 10) {
      toast.error(t("counterparties.taxInvalid"));
      return;
    }
    setVoenCheckBusy(true);
    // 1) Global company directory (enriched profile)
    const dirRes = await apiFetch(
      `/api/organization/directory/by-voen/${encodeURIComponent(d)}`,
    );
    let hasLookupData = false;
    if (dirRes.ok) {
      const dir = await safeJson<{
        name: string;
        legalAddress?: string | null;
        phone?: string | null;
        directorName?: string | null;
      }>(dirRes);
      if (dir) {
        if (dir.name?.trim()) {
          hasLookupData = true;
          if (!name.trim() || name.trim() !== dir.name.trim()) {
            setName(dir.name);
          }
        }
        if (dir.legalAddress?.trim()) {
          const incoming = dir.legalAddress.trim();
          setAddress((prev) => {
            const cur = prev.trim();
            if (!cur) return incoming;
            if (cur !== incoming) return incoming;
            return prev;
          });
        }
      }
    }
    // 2) MDM lookup
    const mdm = await apiFetch(`/api/counterparties/global/by-voen/${encodeURIComponent(d)}`);
    if (mdm.ok) {
      const g = await safeJson<{
        taxId: string;
        name: string;
        legalAddress?: string | null;
        vatStatus?: boolean | null;
      }>(mdm);
      if (g) {
        setVoenCheckBusy(false);
        // Merge logic: patch only missing fields or different values; never reset user-entered data.
        if (g.name?.trim()) {
          hasLookupData = true;
          if (!name.trim() || name.trim() !== g.name.trim()) {
            setName(g.name);
          }
        }
        if (g.vatStatus !== undefined && g.vatStatus !== null && isVatPayer !== g.vatStatus) {
          setIsVatPayer(g.vatStatus);
        }
        if (g.legalAddress?.trim()) {
          const incoming = g.legalAddress.trim();
          setAddress((prev) => {
            const cur = prev.trim();
            if (!cur) return incoming;
            if (cur !== incoming) return incoming;
            return prev;
          });
        }
        setNameLockedByLookup(hasLookupData);
        return;
      }
    }
    if (!allowFallback) {
      setVoenCheckBusy(false);
      return;
    }
    // 3) External lookup fallback (e-taxes)
    const res = await apiFetch(`/api/tax/taxpayer-info?voen=${encodeURIComponent(d)}`);
    setVoenCheckBusy(false);
    if (!res.ok) {
      toast.error(t("counterparties.voenCheckErr"), {
        description: `${res.status} ${await res.text()}`,
      });
      return;
    }
    const j = await safeJson<{
      name: string;
      isVatPayer: boolean;
      address: string | null;
      isRiskyTaxpayer?: boolean | null;
    }>(res);
    if (!j) {
      toast.error(t("counterparties.voenCheckErr"), {
        description: "empty response",
      });
      return;
    }
    if (j.name?.trim()) {
      hasLookupData = true;
      if (!name.trim() || name.trim() !== j.name.trim()) {
        setName(j.name);
      }
    }
    if (isVatPayer !== j.isVatPayer) {
      setIsVatPayer(j.isVatPayer);
    }
    if (j.isRiskyTaxpayer !== undefined) {
      setIsRiskyTaxpayer(j.isRiskyTaxpayer ?? null);
    }
    if (j.address?.trim()) {
      const incoming = j.address.trim();
      setAddress((prev) => {
        const cur = prev.trim();
        if (!cur) return incoming;
        if (cur !== incoming) return incoming;
        return prev;
      });
    }
    setNameLockedByLookup(hasLookupData);
  }

  useEffect(() => {
    if (!open) return;
    // reset form on open
    setName("");
    setTaxId("");
    setKind("LEGAL_ENTITY");
    setRole("CUSTOMER");
    setAddress("");
    setEmail("");
    setIban("");
    setIsVatPayer(null);
    setIsRiskyTaxpayer(null);
    setNameLockedByLookup(false);
    setVoenCheckBusy(false);
    setIbanDeepBusy(false);
    setBusy(false);
    lastAutoLookup.current = "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (digits.length !== 10) return;
    if (lastAutoLookup.current === digits) return;
    lastAutoLookup.current = digits;
    // обязательный авто-lookup: MDM -> e-taxes fallback
    void checkVoen({ allowFallback: true });
  }, [digits, open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("counterparties.nameRequired", { defaultValue: "Укажите название" }));
      return;
    }
    if (!taxValid) {
      toast.error(t("counterparties.taxInvalid"));
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
      iban: iban.trim() || undefined,
      ...(isVatPayer !== null && { isVatPayer }),
    };
    const res = await apiFetch("/api/counterparties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("counterparties.createErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    notifyListRefresh("counterparties");
    onClose();
  }

  async function runDeepIbanValidation() {
    const local = validateAzIban(iban);
    if (!local.isValid) {
      toast.error(t("counterparties.ibanInvalidLocal"));
      return;
    }
    setIbanDeepBusy(true);
    try {
      const res = await apiFetch("/api/banking/validate-iban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban: local.normalized }),
      });
      if (res.ok) {
        const body = (await safeJson<{
          bankName?: string | null;
          bic?: string | null;
        }>(res)) ?? { bankName: null, bic: null };
        if (body.bankName) {
          toast.success(
            t("counterparties.ibanDeepOkDetailed", {
              bank: body.bankName,
              bic: body.bic ?? "—",
            }),
          );
        } else {
          toast.success(t("counterparties.ibanDeepOk"));
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
              title: t("counterparties.ibanDeepPaywallTitle"),
              body: t("counterparties.ibanDeepPaywallBody"),
            },
          }),
        );
        return;
      }
      toast.error(t("counterparties.ibanDeepErr"), { description: `${res.status}` });
    } finally {
      setIbanDeepBusy(false);
    }
  }

  return (
    <SalesModalShell
      open={open}
      title={t("counterparties.newTitle")}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      footer={
        <SalesModalFooter
          onCancel={onClose}
          busy={busy}
          saveDisabled={!taxValid || !name.trim()}
          formId="create-counterparty-form"
        />
      }
    >
      <form
        id="create-counterparty-form"
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4"
      >
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
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              maxLength={10}
              value={digits}
              onChange={(e) => {
                setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10));
                setNameLockedByLookup(false);
              }}
              className={`${inputFieldClass} flex-1 min-w-[140px]`}
              aria-invalid={!taxValid && digits.length > 0}
            />
            <button
              type="button"
              disabled={voenCheckBusy || !taxValid}
              onClick={() => void checkVoen({ allowFallback: true })}
              className="px-3 py-2 rounded-[2px] border border-[#D5DADF] bg-white text-[#34495E] shadow-sm text-[13px] font-medium hover:bg-[#F4F5F7] disabled:opacity-50 shrink-0"
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
        {isRiskyTaxpayer === true ? (
          <div className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
            {t("counterparties.riskyTaxpayerBadge")}
          </div>
        ) : null}
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
              {t("counterparties.roleTradingPartner", { defaultValue: "Поставщик / Покупатель" })}
            </option>
            <option value="OTHER">{t("counterparties.roleOther", { defaultValue: "Прочее" })}</option>
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
        <div>
          <span className={lbl}>{t("counterparties.iban")}</span>
          <div className="flex items-center gap-2">
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              onBlur={(e) => setIban(e.target.value.replace(/\s+/g, "").toUpperCase())}
              className={`${inputFieldClass} flex-1`}
              placeholder="AZ..."
            />
            {validateAzIban(iban).isValid ? (
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" aria-label="IBAN valid" />
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runDeepIbanValidation()}
              disabled={ibanDeepBusy}
              className="px-3 py-2 rounded-[2px] border border-[#D5DADF] bg-white text-[#34495E] shadow-sm text-[13px] font-medium hover:bg-[#F4F5F7] disabled:opacity-50 shrink-0 inline-flex items-center gap-1.5"
            >
              <Search className="h-4 w-4" aria-hidden />
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {ibanDeepBusy ? t("common.loading") : t("counterparties.ibanDeepCheck")}
            </button>
          </div>
          <p className="mt-2 rounded-[2px] border border-[#D5DADF] bg-[#EBEDF0]/40 p-2 text-xs text-[#34495E]">
            {t("counterparties.ibanHint")}
          </p>
        </div>
      </form>
    </SalesModalShell>
  );
}

