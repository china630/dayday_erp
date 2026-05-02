"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch } from "../../../lib/api-client";
import { safeJson } from "../../../lib/api-fetch";
import {
  COUNTERPARTY_LEGAL_FORMS,
  counterpartyLegalFormI18nKey,
  type CounterpartyLegalForm,
} from "../../../lib/counterparty-legal-form";
import { notifyListRefresh } from "../../../lib/list-refresh-bus";
import {
  MODAL_CHECKBOX_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_INPUT_CLASS,
  MODAL_INPUT_TAX_ID_CLASS,
} from "../../../lib/design-system";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../ui/select";
import { SalesModalFooter, SalesModalShell } from "./modal-shell";

const lbl = MODAL_FIELD_LABEL_CLASS;

function isPoisonLookupName(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (/[<>]/.test(n)) return true;
  return /javascript|noscript|cloudflare|cf-ray|you need to enable|checking your browser/i.test(n);
}

type CounterpartyRow = {
  id: string;
  name: string;
  taxId: string;
  role: string;
  legalForm?: string;
  email: string | null;
  address: string | null;
  isVatPayer?: boolean;
};

export function EditCounterpartyModal({
  open,
  counterpartyId,
  onClose,
  onSaved,
}: {
  open: boolean;
  counterpartyId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER">("CUSTOMER");
  const [legalForm, setLegalForm] = useState<CounterpartyLegalForm>("LLC");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [isVatPayer, setIsVatPayer] = useState(false);
  const [isRiskyTaxpayer, setIsRiskyTaxpayer] = useState<boolean | null>(null);
  const [voenCheckBusy, setVoenCheckBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const lastAutoLookup = useRef<string>("");

  const digits = useMemo(() => taxId.replace(/\D/g, ""), [taxId]);
  const taxValid = digits.length === 10;

  const [i18nResourceTick, setI18nResourceTick] = useState(0);
  useEffect(() => {
    const bump = () => setI18nResourceTick((n) => n + 1);
    const store = i18n.store;
    store.on("added", bump);
    store.on("removed", bump);
    i18n.on("languageChanged", bump);
    return () => {
      store.off("added", bump);
      store.off("removed", bump);
      i18n.off("languageChanged", bump);
    };
  }, [i18n]);

  const legalFormOptions = useMemo(
    () =>
      COUNTERPARTY_LEGAL_FORMS.map((v) => ({
        value: v,
        label: t(counterpartyLegalFormI18nKey(v)),
      })),
    [t, i18n.language, i18nResourceTick],
  );

  const load = useCallback(async () => {
    if (!counterpartyId) return;
    setLoadBusy(true);
    setLoadErr(null);
    const res = await apiFetch(`/api/counterparties/${counterpartyId}`);
    setLoadBusy(false);
    if (!res.ok) {
      setLoadErr(`${t("counterparties.loadErr")}: ${res.status}`);
      return;
    }
    const r = (await res.json()) as CounterpartyRow;
    setName(r.name);
    setTaxId(r.taxId);
    setRole(r.role as "CUSTOMER" | "SUPPLIER" | "BOTH" | "OTHER");
    const lf = r.legalForm as CounterpartyLegalForm | undefined;
    setLegalForm(
      lf && (COUNTERPARTY_LEGAL_FORMS as readonly string[]).includes(lf) ? lf : "LLC",
    );
    setAddress(r.address ?? "");
    setEmail(r.email ?? "");
    setIsVatPayer(Boolean(r.isVatPayer));
    setIsRiskyTaxpayer(null);
    const d = String(r.taxId ?? "").replace(/\D/g, "");
    lastAutoLookup.current = d.length === 10 ? d : "";
  }, [counterpartyId, t]);

  useEffect(() => {
    if (!open || !counterpartyId) return;
    void load();
  }, [open, counterpartyId, load]);

  async function checkVoen({ allowFallback }: { allowFallback: boolean }) {
    const d = digits;
    if (d.length !== 10) {
      toast.error(t("counterparties.taxInvalid"));
      return;
    }
    setVoenCheckBusy(true);
    try {
      const dirRes = await apiFetch(`/api/organization/directory/by-voen/${encodeURIComponent(d)}`);
      if (dirRes.ok) {
        const dir = await safeJson<{
          name: string;
          legalAddress?: string | null;
        }>(dirRes);
        if (dir?.name?.trim() && !isPoisonLookupName(dir.name)) {
          setName(dir.name.trim());
        }
        if (dir?.legalAddress?.trim()) {
          const incoming = dir.legalAddress.trim();
          setAddress((prev) => {
            const cur = prev.trim();
            if (!cur) return incoming;
            if (cur !== incoming) return incoming;
            return prev;
          });
        }
      }

      const mdm = await apiFetch(`/api/counterparties/global/by-voen/${encodeURIComponent(d)}`);
      if (mdm.ok) {
        const g = await safeJson<{
          taxId: string;
          name: string;
          legalAddress?: string | null;
          vatStatus?: boolean | null;
        }>(mdm);
        if (g) {
          let mdmProvidedName = false;
          if (g.name?.trim() && !isPoisonLookupName(g.name)) {
            mdmProvidedName = true;
            setName(g.name.trim());
          }
          if (g.vatStatus !== undefined && g.vatStatus !== null) {
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
          if (!allowFallback) {
            return;
          }
          if (mdmProvidedName) {
            return;
          }
        }
      }

      if (!allowFallback) {
        return;
      }

      const res = await apiFetch(`/api/tax/taxpayer-info?voen=${encodeURIComponent(d)}`);
      if (!res.ok) {
        toast.error(t("counterparties.voenLookupNotFound"));
        return;
      }
      const j = await safeJson<{
        name: string;
        isVatPayer: boolean;
        address: string | null;
        isRiskyTaxpayer?: boolean | null;
      }>(res);
      if (!j?.name?.trim() || isPoisonLookupName(j.name)) {
        toast.error(t("counterparties.voenLookupNotFound"));
        return;
      }
      setName(j.name.trim());
      setIsVatPayer(j.isVatPayer);
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
    } catch (err) {
      console.error("[checkVoen]", err);
      toast.error(t("counterparties.voenLookupNotFound"));
    } finally {
      setVoenCheckBusy(false);
    }
  }

  async function handleCheckVoen() {
    await checkVoen({ allowFallback: true });
  }

  useEffect(() => {
    if (!open || !counterpartyId) return;
    if (digits.length !== 10) return;
    if (lastAutoLookup.current === digits) return;
    lastAutoLookup.current = digits;
    void checkVoen({ allowFallback: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, open, counterpartyId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!counterpartyId) return;
    if (!name.trim()) {
      toast.error(t("counterparties.nameRequired"));
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
      role,
      legalForm,
      address: address.trim() || undefined,
      email: email.trim() || undefined,
      isVatPayer,
    };
    const res = await apiFetch(`/api/counterparties/${counterpartyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("counterparties.updateErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    notifyListRefresh("counterparties");
    onSaved?.();
    onClose();
  }

  if (!open || !counterpartyId) return null;

  return (
    <SalesModalShell
      open={open}
      title={t("counterparties.editSection")}
      onClose={onClose}
      maxWidthClass="max-w-xl"
      footer={
        <SalesModalFooter
          onCancel={onClose}
          busy={busy || loadBusy}
          formId="edit-counterparty-form"
          cancelVariant="ghost"
        />
      }
    >
      <div className="space-y-4">
        {loadErr ? <p className="text-[13px] text-red-600">{loadErr}</p> : null}
        {loadBusy ? <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p> : null}
        <form
          id="edit-counterparty-form"
          noValidate
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-4"
        >
        <div>
          <span className={lbl}>{t("counterparties.name")}</span>
          <input
            name="name"
            autoComplete="organization"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={MODAL_INPUT_CLASS}
            disabled={loadBusy}
          />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.taxId")}</span>
          <div className="flex w-full max-w-md min-w-0 items-center justify-between gap-3">
            <input
              name="taxId"
              inputMode="numeric"
              maxLength={10}
              value={digits}
              onChange={(e) => {
                setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10));
              }}
              className={MODAL_INPUT_TAX_ID_CLASS}
              aria-invalid={!taxValid && digits.length > 0}
              disabled={loadBusy}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={voenCheckBusy || !taxValid || loadBusy}
              aria-busy={voenCheckBusy}
              aria-label={t("counterparties.yoxla")}
              className="shrink-0 self-center"
              onClick={(e) => {
                e.preventDefault();
                void handleCheckVoen();
              }}
            >
              {voenCheckBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                t("counterparties.yoxla")
              )}
            </Button>
          </div>
        </div>
        <div>
          <span className={lbl}>{t("counterparties.legalFormField")}</span>
          <Select
            key={i18n.language}
            value={legalForm}
            onValueChange={(v) => setLegalForm(v as CounterpartyLegalForm)}
            className={MODAL_INPUT_CLASS}
            disabled={loadBusy}
          >
            <SelectTrigger className="" />
            <SelectContent>
              {legalFormOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#34495E]">
          <input type="checkbox" className={MODAL_CHECKBOX_CLASS}
            checked={isVatPayer}
            onChange={(e) => setIsVatPayer(e.target.checked)}
            disabled={loadBusy}
          />
          <span>{t("counterparties.vatPayerCheckbox")}</span>
        </label>
        {isRiskyTaxpayer === true ? (
          <div className="inline-flex items-center rounded-[2px] border border-amber-300 bg-amber-100 px-2.5 py-1 text-[13px] font-semibold text-amber-900">
            {t("counterparties.riskyTaxpayerBadge")}
          </div>
        ) : null}
        <div>
          <span className={lbl}>{t("counterparties.role")}</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className={MODAL_INPUT_CLASS}
            disabled={loadBusy}
          >
            <option value="CUSTOMER">{t("counterparties.roleCustomer")}</option>
            <option value="SUPPLIER">{t("counterparties.roleSupplier")}</option>
            <option value="BOTH">{t("counterparties.roleTradingPartner")}</option>
            <option value="OTHER">{t("counterparties.roleOther")}</option>
          </select>
        </div>
        <div>
          <span className={lbl}>{t("counterparties.address")}</span>
          <input
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={MODAL_INPUT_CLASS}
            disabled={loadBusy}
          />
        </div>
        <div>
          <span className={lbl}>{t("counterparties.email")}</span>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={MODAL_INPUT_CLASS}
            disabled={loadBusy}
          />
        </div>
        </form>
      </div>
    </SalesModalShell>
  );
}
