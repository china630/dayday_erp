"use client";

import { ChevronDown, Package } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { PRIMARY_BUTTON_CLASS } from "../../../lib/design-system";
import { formatMoneyAzn } from "../../../lib/format-money";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/empty-state";
import { CreateServiceModal } from "./create-service-modal";
import { ProductModal } from "./product-modal";

type Row = {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  vatRate: unknown;
  isService?: boolean;
};

function formatProductVatCell(vatRate: unknown, t: (k: string) => string): string {
  const n = Number(String(vatRate ?? ""));
  if (n === -1) return t("products.vatOptionExempt");
  if (n === 0) return t("products.vatOption0");
  if (Number.isFinite(n)) return `${n}%`;
  return String(vatRate ?? "—");
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const addMenuRef = useRef<HTMLDetailsElement>(null);

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

  function closeAddMenu() {
    const el = addMenuRef.current;
    if (el) el.open = false;
  }

  function openEdit(id: string) {
    setCreateProductOpen(false);
    setCreateServiceOpen(false);
    setEditId(id);
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
      <PageHeader
        title={t("products.catalogPageTitle")}
        subtitle={t("products.subtitle")}
        actions={
          <details ref={addMenuRef} className="relative inline-block text-left">
            <summary
              className={`${PRIMARY_BUTTON_CLASS} inline-flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden`}
            >
              {t("products.addDropdownLabel")}
              <ChevronDown className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            </summary>
            <div className="absolute right-0 z-20 mt-1 min-w-[14rem] rounded-[2px] border border-[#D5DADF] bg-white py-1 shadow-md">
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-[#34495E] hover:bg-[#F4F5F7]"
                onClick={() => {
                  closeAddMenu();
                  setEditId(null);
                  setCreateServiceOpen(false);
                  setCreateProductOpen(true);
                }}
              >
                {t("products.newProductMenu")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm text-[#34495E] hover:bg-[#F4F5F7]"
                onClick={() => {
                  closeAddMenu();
                  setEditId(null);
                  setCreateProductOpen(false);
                  setCreateServiceOpen(true);
                }}
              >
                {t("products.newServiceMenu")}
              </button>
            </div>
          </details>
        }
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("products.list")}</h2>
        {loading && <p className="text-gray-600">{t("common.loading")}</p>}
        {!loading && rows.length === 0 && !error && (
          <EmptyState
            title={t("products.none")}
            description={t("products.emptyHint")}
            icon={<Package className="h-12 w-12 mx-auto stroke-[1.5] text-[#7F8C8D]" aria-hidden />}
            action={
              <details className="relative inline-block text-left">
                <summary
                  className={`${PRIMARY_BUTTON_CLASS} inline-flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden`}
                >
                  {t("products.addDropdownLabel")}
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                </summary>
                <div className="absolute left-0 z-20 mt-1 min-w-[14rem] rounded-[2px] border border-[#D5DADF] bg-white py-1 shadow-md">
                  <button
                    type="button"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#34495E] hover:bg-[#F4F5F7]"
                    onClick={(e) => {
                      const d = e.currentTarget.closest("details");
                      if (d) (d as HTMLDetailsElement).open = false;
                      setCreateServiceOpen(false);
                      setCreateProductOpen(true);
                    }}
                  >
                    {t("products.newProductMenu")}
                  </button>
                  <button
                    type="button"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#34495E] hover:bg-[#F4F5F7]"
                    onClick={(e) => {
                      const d = e.currentTarget.closest("details");
                      if (d) (d as HTMLDetailsElement).open = false;
                      setCreateProductOpen(false);
                      setCreateServiceOpen(true);
                    }}
                  >
                    {t("products.newServiceMenu")}
                  </button>
                </div>
              </details>
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
                    <td>{r.isService ? "—" : r.sku}</td>
                    <td>{formatMoneyAzn(r.price)}</td>
                    <td>{formatProductVatCell(r.vatRate, t)}</td>
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
        open={createProductOpen}
        productId={null}
        createAs="product"
        onClose={() => setCreateProductOpen(false)}
        onSaved={() => void load()}
      />
      <CreateServiceModal
        open={createServiceOpen}
        onClose={() => setCreateServiceOpen(false)}
        onSaved={() => void load()}
      />
      <ProductModal
        open={editId !== null}
        productId={editId}
        onClose={() => setEditId(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}
