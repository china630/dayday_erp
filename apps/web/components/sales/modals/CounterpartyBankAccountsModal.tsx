"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Landmark, Trash2 } from "lucide-react";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldClass } from "../../../lib/form-classes";
import { PRIMARY_BUTTON_CLASS } from "../../../lib/design-system";
import { SalesModalShell } from "./modal-shell";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

type BankAccountRow = {
  id: string;
  bankName: string;
  iban: string;
  swift: string | null;
  currency: string;
  isPrimary: boolean;
};

export function CounterpartyBankAccountsModal({
  open,
  counterpartyId,
  counterpartyName,
  onClose,
}: {
  open: boolean;
  counterpartyId: string | null;
  counterpartyName?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<BankAccountRow[]>([]);
  const [loadBusy, setLoadBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [swift, setSwift] = useState("");
  const [currency, setCurrency] = useState("AZN");

  const load = useCallback(async () => {
    if (!counterpartyId) return;
    setLoadBusy(true);
    try {
      const res = await apiFetch(`/api/counterparties/${counterpartyId}/bank-accounts`);
      if (!res.ok) {
        toast.error(t("counterparties.bankAccounts_loadErr"), { description: `${res.status}` });
        setRows([]);
        return;
      }
      const data = (await res.json()) as BankAccountRow[];
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoadBusy(false);
    }
  }, [counterpartyId, t]);

  useEffect(() => {
    if (!open || !counterpartyId) return;
    setBankName("");
    setIban("");
    setSwift("");
    setCurrency("AZN");
    void load();
  }, [open, counterpartyId, load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!counterpartyId) return;
    const bn = bankName.trim();
    const ib = iban.trim().replace(/\s+/g, "").toUpperCase();
    if (!bn || !ib) {
      toast.error(t("counterparties.nameRequired"));
      return;
    }
    setAddBusy(true);
    try {
      const res = await apiFetch(`/api/counterparties/${counterpartyId}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName: bn,
          iban: ib,
          swift: swift.trim() || undefined,
          currency: currency.trim().toUpperCase() || "AZN",
        }),
      });
      if (!res.ok) {
        toast.error(t("counterparties.bankAccounts_createErr"), { description: await res.text() });
        return;
      }
      toast.success(t("common.save"));
      setBankName("");
      setIban("");
      setSwift("");
      setCurrency("AZN");
      await load();
    } finally {
      setAddBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!counterpartyId) return;
    setDelId(id);
    try {
      const res = await apiFetch(`/api/counterparties/${counterpartyId}/bank-accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("counterparties.bankAccounts_deleteErr"), { description: await res.text() });
        return;
      }
      toast.success(t("common.save"));
      await load();
    } finally {
      setDelId(null);
    }
  }

  if (!open || !counterpartyId) return null;

  const subtitle = counterpartyName?.trim() ? counterpartyName.trim() : undefined;

  return (
    <SalesModalShell
      open={open}
      title={t("counterparties.bankAccounts_title")}
      subtitle={subtitle}
      onClose={onClose}
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#34495E]">
            <Landmark className="h-4 w-4 shrink-0" aria-hidden />
            {t("counterparties.bankAccounts_current")}
          </h4>
          {loadBusy ? (
            <p className="text-sm text-slate-600">{t("common.loading")}</p>
          ) : rows.length === 0 ? (
            <p className="rounded-[2px] border border-[#D5DADF] bg-[#EBEDF0]/40 p-3 text-sm text-[#7F8C8D]">
              {t("counterparties.bankAccounts_empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[2px] border border-[#D5DADF]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5DADF] bg-[#F4F5F7]">
                    <th className="p-2 font-semibold text-[#34495E]">{t("counterparties.bankAccounts_colBank")}</th>
                    <th className="p-2 font-semibold text-[#34495E]">{t("counterparties.bankAccounts_colIban")}</th>
                    <th className="p-2 font-semibold text-[#34495E]">{t("counterparties.bankAccounts_colCurrency")}</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="p-2 align-middle">{r.bankName}</td>
                      <td className="p-2 align-middle font-mono text-xs">{r.iban}</td>
                      <td className="p-2 align-middle">{r.currency}</td>
                      <td className="p-2 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => void onDelete(r.id)}
                          disabled={delId === r.id}
                          className="inline-flex rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          aria-label={t("counterparties.bankAccounts_delete")}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form className="space-y-3 border-t border-[#EBEDF0] pt-4" onSubmit={(e) => void onAdd(e)}>
          <div>
            <span className={lbl}>{t("counterparties.bankAccounts_colBank")}</span>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={inputFieldClass}
              placeholder={t("counterparties.bankAccounts_namePh")}
            />
          </div>
          <div>
            <span className={lbl}>{t("counterparties.bankAccounts_colIban")}</span>
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              onBlur={(e) => setIban(e.target.value.replace(/\s+/g, "").toUpperCase())}
              className={`${inputFieldClass} font-mono text-sm`}
              placeholder="AZ..."
            />
          </div>
          <div>
            <span className={lbl}>{t("counterparties.bankAccounts_colSwift")}</span>
            <input
              value={swift}
              onChange={(e) => setSwift(e.target.value.toUpperCase())}
              className={`${inputFieldClass} font-mono text-sm`}
            />
          </div>
          <div>
            <span className={lbl}>{t("counterparties.bankAccounts_colCurrency")}</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
              className={`${inputFieldClass} max-w-[8rem]`}
              placeholder={t("counterparties.bankAccounts_currencyPh")}
            />
          </div>
          <button type="submit" disabled={addBusy} className={PRIMARY_BUTTON_CLASS}>
            {addBusy ? t("common.loading") : t("counterparties.bankAccounts_add")}
          </button>
        </form>
      </div>
    </SalesModalShell>
  );
}
