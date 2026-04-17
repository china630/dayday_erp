"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyListRefresh } from "../../../lib/list-refresh-bus";
import { inputFieldClass } from "../../../lib/form-classes";
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
  const [isVatPayer, setIsVatPayer] = useState<boolean | null>(null);
  const [voenCheckBusy, setVoenCheckBusy] = useState(false);
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
    // 1) MDM lookup
    const mdm = await apiFetch(`/api/counterparties/global/by-voen/${encodeURIComponent(d)}`);
    if (mdm.ok) {
      const g = (await mdm.json()) as {
        taxId: string;
        name: string;
        legalAddress?: string | null;
        vatStatus?: boolean | null;
      } | null;
      if (g) {
        setVoenCheckBusy(false);
        setName(g.name);
        setIsVatPayer(g.vatStatus ?? null);
        if (g.legalAddress?.trim()) setAddress((a) => (a.trim() ? a : g.legalAddress!));
        return;
      }
    }
    if (!allowFallback) {
      setVoenCheckBusy(false);
      return;
    }
    // 2) External lookup fallback (e-taxes)
    const res = await apiFetch(`/api/tax/taxpayer-info?voen=${encodeURIComponent(d)}`);
    setVoenCheckBusy(false);
    if (!res.ok) {
      toast.error(t("counterparties.voenCheckErr"), {
        description: `${res.status} ${await res.text()}`,
      });
      return;
    }
    const j = (await res.json()) as {
      name: string;
      isVatPayer: boolean;
      address: string | null;
    };
    setName(j.name);
    setIsVatPayer(j.isVatPayer);
    if (j.address?.trim()) setAddress((a) => (a.trim() ? a : j.address!));
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
    setIsVatPayer(null);
    setVoenCheckBusy(false);
    setBusy(false);
    lastAutoLookup.current = "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (digits.length !== 10) return;
    if (lastAutoLookup.current === digits) return;
    lastAutoLookup.current = digits;
    // авто-lookup только по MDM
    void checkVoen({ allowFallback: false });
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
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.taxId")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="numeric"
              maxLength={10}
              value={digits}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))}
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
      </form>
    </SalesModalShell>
  );
}

