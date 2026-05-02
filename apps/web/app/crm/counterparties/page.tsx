"use client";

import Link from "next/link";
import { CreditCard, Pencil, Scale, Users2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { subscribeListRefresh } from "../../../lib/list-refresh-bus";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import {
  DATA_TABLE_ACTIONS_TD_CLASS,
  DATA_TABLE_ACTIONS_TH_CLASS,
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CENTER_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_CENTER_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  PRIMARY_BUTTON_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
} from "../../../lib/design-system";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/layout/page-header";
import {
  CounterpartyBankAccountsModal,
  CreateCounterpartyModal,
  EditCounterpartyModal,
} from "../../../components/sales/modals";
import type { CounterpartyLegalForm } from "../../../lib/counterparty-legal-form";
import {
  COUNTERPARTY_LEGAL_FORMS,
  counterpartyLegalFormI18nKey,
} from "../../../lib/counterparty-legal-form";

type Row = {
  id: string;
  name: string;
  taxId: string;
  legalForm?: string | null;
  role: string;
  email: string | null;
  address: string | null;
  isVatPayer?: boolean | null;
};

function legalFormLabel(t: (k: string) => string, code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "—";
  if ((COUNTERPARTY_LEGAL_FORMS as readonly string[]).includes(c)) {
    return t(counterpartyLegalFormI18nKey(c));
  }
  return c;
}

export default function CounterpartiesPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bankModal, setBankModal] = useState<{ id: string; name: string } | null>(null);

  const filtered = useCallback(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const name = String(r.name ?? "").toLowerCase();
      const voen = String(r.taxId ?? "").toLowerCase();
      return name.includes(term) || voen.includes(term);
    });
  }, [q, rows]);

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/counterparties");
    if (!res.ok) {
      setError(`${t("counterparties.loadErr")}: ${res.status}`);
      setRows([]);
    } else {
      setRows(await res.json());
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  useEffect(() => {
    if (!ready || !token) return;
    return subscribeListRefresh("counterparties", () => void load());
  }, [load, ready, token]);

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("counterparties.title")}
        subtitle={t("counterparties.subtitle")}
        actions={
          <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setCreateOpen(true)}>
            + {t("counterparties.newBtn")}
          </button>
        }
      />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="m-0 text-lg font-semibold text-gray-900">{t("counterparties.list")}</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("counterparties.search", { defaultValue: "Поиск по имени или VÖEN…" })}
            className="w-full max-w-md shrink-0 rounded-[2px] border border-[#D5DADF] px-3 py-2 text-sm outline-none focus:border-[#2980B9] sm:max-w-xs"
          />
        </div>
        {loading && <p className="text-gray-600">{t("common.loading")}</p>}
        {!loading && rows.length === 0 && !error && (
          <EmptyState
            title={t("counterparties.none")}
            description={t("counterparties.emptyHint")}
            icon={<Users2 className="mx-auto h-12 w-12 stroke-[1.5] text-[#7F8C8D]" aria-hidden />}
            action={
              <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setCreateOpen(true)}>
                + {t("counterparties.newBtn")}
              </button>
            }
          />
        )}
        {!loading && rows.length > 0 && filtered().length === 0 && !error && (
          <EmptyState
            title={t("counterparties.none", { defaultValue: "Нет контрагентов" })}
            description={t("counterparties.emptyHint", { defaultValue: "Попробуйте изменить запрос поиска." })}
            icon={<Users2 className="mx-auto h-12 w-12 stroke-[1.5] text-[#7F8C8D]" aria-hidden />}
          />
        )}
        {!loading && filtered().length > 0 && (
          <div className={DATA_TABLE_VIEWPORT_CLASS}>
            <table className={DATA_TABLE_CLASS}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("counterparties.thName")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("counterparties.thTaxId")}</th>
                  <th className={DATA_TABLE_TH_CENTER_CLASS}>{t("counterparties.vatStatus")}</th>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("counterparties.thLegalForm")}</th>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("counterparties.thRole")}</th>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("counterparties.thEmail")}</th>
                  <th className={`${DATA_TABLE_ACTIONS_TH_CLASS} min-w-[120px]`}>
                    {t("counterparties.bankAccounts_actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered().map((r) => (
                  <tr key={r.id} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_CLASS} font-semibold text-[#34495E]`}>{r.name}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{r.taxId}</td>
                    <td className={DATA_TABLE_TD_CENTER_CLASS}>
                      {r.isVatPayer === true
                        ? t("counterparties.vatPayerYes")
                        : r.isVatPayer === false
                          ? t("counterparties.vatPayerNo")
                          : "—"}
                    </td>
                    <td className={DATA_TABLE_TD_CLASS}>{legalFormLabel(t, r.legalForm)}</td>
                    <td className={DATA_TABLE_TD_CLASS}>{r.role}</td>
                    <td className={DATA_TABLE_TD_CLASS}>{r.email ?? "—"}</td>
                    <td className={DATA_TABLE_ACTIONS_TD_CLASS}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className={TABLE_ROW_ICON_BTN_CLASS}
                          title={t("counterparties.edit")}
                          onClick={() => setEditId(r.id)}
                        >
                          <Pencil className="h-4 w-4 text-[#7F8C8D]" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={TABLE_ROW_ICON_BTN_CLASS}
                          title={t("counterparties.bankAccounts_menu")}
                          onClick={() => setBankModal({ id: r.id, name: r.name })}
                        >
                          <CreditCard className="h-4 w-4 text-[#7F8C8D]" aria-hidden />
                        </button>
                        <Link
                          href={`/crm/counterparties/${r.id}/reconciliation`}
                          className={TABLE_ROW_ICON_BTN_CLASS}
                          title={t("counterparties.tabReconciliation")}
                        >
                          <Scale className="h-4 w-4 text-[#2980B9]" aria-hidden />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateCounterpartyModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditCounterpartyModal
        open={Boolean(editId)}
        counterpartyId={editId}
        onClose={() => setEditId(null)}
        onSaved={() => void load()}
      />
      <CounterpartyBankAccountsModal
        open={Boolean(bankModal)}
        counterpartyId={bankModal?.id ?? null}
        counterpartyName={bankModal?.name}
        onClose={() => setBankModal(null)}
      />
    </div>
  );
}
