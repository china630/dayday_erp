"use client";

import Link from "next/link";
import { Users2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { subscribeListRefresh } from "../../lib/list-refresh-bus";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { PRIMARY_BUTTON_CLASS } from "../../lib/design-system";
import { useRequireAuth } from "../../lib/use-require-auth";
import { ModulePageLinks } from "../../components/module-page-links";
import { EmptyState } from "../../components/empty-state";
import { CreateCounterpartyModal } from "../../components/sales/modals";

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

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
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/invoices", labelKey: "nav.invoices" },
          { href: "/products", labelKey: "nav.products" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("counterparties.title")}</h1>
          <p className="text-sm text-slate-600 mt-1">{t("counterparties.subtitle")}</p>
        </div>
        <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setCreateOpen(true)}>
          + {t("counterparties.newBtn")}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("counterparties.list")}</h2>
        {loading && <p className="text-gray-600">{t("common.loading")}</p>}
        {!loading && rows.length === 0 && !error && (
          <EmptyState
            title={t("counterparties.none")}
            description={t("counterparties.emptyHint")}
            icon={
              <Users2 className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />
            }
            action={
            <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => setCreateOpen(true)}>
                + {t("counterparties.newBtn")}
            </button>
            }
          />
        )}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2">{t("counterparties.thName")}</th>
                  <th className="text-left p-2">{t("counterparties.thTaxId")}</th>
                  <th className="text-left p-2">{t("counterparties.vatStatus")}</th>
                  <th className="text-left p-2">{t("counterparties.thKind")}</th>
                  <th className="text-left p-2">{t("counterparties.thRole")}</th>
                  <th className="text-left p-2">{t("counterparties.thEmail")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
                      <Link
                        href={`/counterparties/${r.id}/edit`}
                        className="text-action text-sm hover:underline"
                      >
                        {t("counterparties.edit")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateCounterpartyModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
