"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";
import { PRIMARY_BUTTON_CLASS } from "../../lib/design-system";
import { formatMoneyAzn } from "../../lib/format-money";
import { useRequireAuth } from "../../lib/use-require-auth";
import { ModulePageLinks } from "../../components/module-page-links";
import { EmptyState } from "../../components/empty-state";
import { ProductModal } from "./product-modal";

type Row = {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  vatRate: unknown;
};

export default function ProductsPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch("/api/products");
    if (!res.ok) {
      setError(`${t("products.loadErr")}: ${res.status}`);
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

  function openCreate() {
    setEditId(null);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setModalOpen(true);
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
    <div className="space-y-8">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/invoices", labelKey: "nav.invoices" },
          { href: "/counterparties", labelKey: "nav.counterparties" },
          { href: "/inventory", labelKey: "nav.inventory" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("products.title")}</h1>
          <p className="text-sm text-slate-600 mt-1">{t("products.subtitle")}</p>
        </div>
        <button type="button" onClick={openCreate} className={PRIMARY_BUTTON_CLASS}>
          + {t("products.newBtn")}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("products.list")}</h2>
        {loading && <p className="text-gray-600">{t("common.loading")}</p>}
        {!loading && rows.length === 0 && !error && (
          <EmptyState
            title={t("products.none")}
            description={t("products.emptyHint")}
            icon={
              <Package className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />
            }
            action={
              <button type="button" onClick={openCreate} className={PRIMARY_BUTTON_CLASS}>
                + {t("products.newBtn")}
              </button>
            }
          />
        )}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <table>
              <thead>
                <tr>
                  <th>{t("products.thName")}</th>
                  <th>{t("products.thSku")}</th>
                  <th>{t("products.thPrice")}</th>
                  <th>{t("products.thVat")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium text-gray-900">{r.name}</td>
                    <td>{r.sku}</td>
                    <td>{formatMoneyAzn(r.price)}</td>
                    <td>{String(r.vatRate)}</td>
                    <td>
                      <button
                        type="button"
                        className="text-action text-sm hover:underline"
                        onClick={() => openEdit(r.id)}
                      >
                        {t("products.edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ProductModal
        open={modalOpen}
        productId={editId}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
