"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../lib/form-styles";

type ProductDto = {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  vatRate: unknown;
  isService?: boolean;
};

export function ProductModal({
  open,
  productId,
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!productId;

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [vatRate, setVatRate] = useState("18");
  const [isService, setIsService] = useState(false);

  const title = useMemo(() => {
    return isEdit ? t("products.editTitle") : t("products.newTitle");
  }, [isEdit, t]);

  useEffect(() => {
    if (!open) return;
    setLoadErr(null);
    if (!productId) {
      setName("");
      setSku("");
      setPrice("");
      setVatRate("18");
      setIsService(false);
      return;
    }
    setLoading(true);
    void apiFetch(`/api/products/${productId}`)
      .then(async (res) => {
        if (!res.ok) {
          setLoadErr(`${t("products.loadErr")}: ${res.status}`);
          return;
        }
        const r = (await res.json()) as ProductDto;
        setName(r.name ?? "");
        setSku(r.sku ?? "");
        setPrice(String(r.price ?? ""));
        setVatRate(String(r.vatRate ?? "18"));
        setIsService(!!r.isService);
      })
      .catch(() => setLoadErr(t("products.loadErr")))
      .finally(() => setLoading(false));
  }, [open, productId, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setLoadErr(null);

    const p = Number(String(price).replace(",", "."));
    const v = Number(String(vatRate).replace(",", "."));
    if (!name.trim() || !sku.trim() || !Number.isFinite(p) || !Number.isFinite(v)) {
      toast.error(t("common.fillRequired"));
      return;
    }

    setBusy(true);
    const res = await apiFetch(isEdit ? `/api/products/${productId}` : "/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        sku: sku.trim(),
        price: p,
        vatRate: v,
        isService,
      }),
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(isEdit ? t("products.updateErr") : t("products.createErr"), {
        description: await res.text(),
      });
      return;
    }

    toast.success(t("common.save"));
    onSaved();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-2xl bg-white p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">{title}</h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">{t("products.subtitle")}</p>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {loadErr ? <p className="text-sm text-red-600 mt-4 mb-0">{loadErr}</p> : null}
        {loading ? <p className="text-sm text-slate-600 mt-4 mb-0">{t("common.loading")}</p> : null}

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <span className={FORM_LABEL_CLASS}>{t("products.name")}</span>
              <input className={FORM_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div>
              <span className={FORM_LABEL_CLASS}>{t("products.sku")}</span>
              <input className={FORM_INPUT_CLASS} value={sku} onChange={(e) => setSku(e.target.value)} required />
            </div>

            <div>
              <span className={FORM_LABEL_CLASS}>{t("products.vat")}</span>
              <input
                className={FORM_INPUT_CLASS}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                required
              />
            </div>

            <div className="md:col-span-2">
              <span className={FORM_LABEL_CLASS}>{t("products.price")}</span>
              <input
                className={FORM_INPUT_CLASS}
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={isService}
              onChange={(e) => setIsService(e.target.checked)}
            />
            <span>
              <span className="font-medium block">{t("products.isService")}</span>
              <span className="text-xs text-slate-500">{t("products.isServiceHint")}</span>
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} disabled={busy}>
              {t("common.back")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy || loading}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

