"use client";

import Link from "next/link";
import { Users2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { subscribeListRefresh } from "../../lib/list-refresh-bus";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { PRIMARY_BUTTON_CLASS } from "../../lib/design-system";
import { useRequireAuth } from "../../lib/use-require-auth";
import { EmptyState } from "../../components/empty-state";
import { PageHeader } from "../../components/layout/page-header";
import { CreateCounterpartyModal, EditCounterpartyModal } from "../../components/sales/modals";

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

export default function CounterpartiesPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

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
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t("counterparties.list")}</h2>
        <div className="mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("counterparties.search", { defaultValue: "Поиск по имени или VÖEN…" })}
            className="w-full max-w-md rounded-[2px] border border-[#D5DADF] px-3 py-2 text-sm outline-none focus:border-[#2980B9]"
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
          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">{t("counterparties.thName")}</th>
                  <th className="p-2 text-left">{t("counterparties.thTaxId")}</th>
                  <th className="p-2 text-left">{t("counterparties.vatStatus")}</th>
                  <th className="p-2 text-left">{t("counterparties.thKind")}</th>
                  <th className="p-2 text-left">{t("counterparties.thRole")}</th>
                  <th className="p-2 text-left">{t("counterparties.thEmail")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {filtered().map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-2 font-medium text-gray-900">{r.name}</td>
                    <td className="p-2">{r.taxId}</td>
                    <td className="p-2">
                      {r.isVatPayer === true
                        ? t("counterparties.vatPayerYes")
                        : r.isVatPayer === false
                          ? t("counterparties.vatPayerNo")
                          : "—"}
                    </td>
                    <td className="p-2">{r.kind}</td>
                    <td className="p-2">{r.role}</td>
                    <td className="p-2">{r.email ?? "—"}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                        <button
                          type="button"
                          className="text-sm text-action hover:underline"
                          onClick={() => setEditId(r.id)}
                        >
                          {t("counterparties.edit")}
                        </button>
                        <Link
                          href={`/counterparties/${r.id}/reconciliation`}
                          className="text-sm text-action hover:underline"
                        >
                          {t("counterparties.tabReconciliation")}
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
    </div>
  );
}
