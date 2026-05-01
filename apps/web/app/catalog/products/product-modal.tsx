"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../../lib/form-styles";

export type ProductModalCreateAs = "product" | "service";

type ProductDto = {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  vatRate: unknown;
  isService?: boolean;
};

type VatSelect = "18" | "0" | "exempt";

function vatSelectFromDto(vatRate: unknown): VatSelect {
  const n = Number(String(vatRate ?? 18));
  if (n === -1) return "exempt";
  if (n === 0) return "0";
  return "18";
}

function vatSelectToApi(v: VatSelect): number {
  if (v === "exempt") return -1;
  if (v === "0") return 0;
  return 18;
}

export function ProductModal({
  open,
  productId,
  createAs = "product",
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: string | null;
  /** Используется только при создании (`productId == null`). */
  createAs?: ProductModalCreateAs;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!productId;
  const isServiceCreate = !isEdit && createAs === "service";

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [vatSelect, setVatSelect] = useState<VatSelect>("18");
  const [loadedIsService, setLoadedIsService] = useState(false);

  const title = useMemo(() => {
    if (isEdit) return t("products.editTitle");
    if (isServiceCreate) return t("products.newServiceTitle");
    return t("products.newProductTitle");
  }, [isEdit, isServiceCreate, t]);

  const showSkuField = isEdit ? !loadedIsService : !isServiceCreate;

  useEffect(() => {
    if (!open) return;
    setLoadErr(null);
    if (!productId) {
      setName("");
      setSku("");
      setPrice("");
      setVatSelect("18");
      setLoadedIsService(false);
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
        setVatSelect(vatSelectFromDto(r.vatRate));
        setLoadedIsService(!!r.isService);
      })
      .catch(() => setLoadErr(t("products.loadErr")))
      .finally(() => setLoading(false));
  }, [open, productId, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setLoadErr(null);

    const p = Number(String(price).replace(",", "."));
    if (!name.trim() || !Number.isFinite(p)) {
      toast.error(t("common.fillRequired"));
      return;
    }

    if (showSkuField && !sku.trim()) {
      toast.error(t("common.fillRequired"));
      return;
    }

    const vatRate = vatSelectToApi(vatSelect);
    const isServicePayload = isEdit ? loadedIsService : isServiceCreate;

    setBusy(true);
    const body: Record<string, unknown> = {
      name: name.trim(),
      price: p,
      vatRate,
    };
    if (showSkuField) {
      body.sku = sku.trim();
    }
    if (!isEdit) {
      body.isService = isServicePayload;
    }

    const res = await apiFetch(isEdit ? `/api/products/${productId}` : "/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

            {showSkuField ? (
              <div>
                <span className={FORM_LABEL_CLASS}>{t("products.sku")}</span>
                <input className={FORM_INPUT_CLASS} value={sku} onChange={(e) => setSku(e.target.value)} required />
              </div>
            ) : null}

            <div className={showSkuField ? "" : "md:col-span-2"}>
              <span className={FORM_LABEL_CLASS}>{t("products.vat")}</span>
              <select
                className={FORM_INPUT_CLASS}
                value={vatSelect}
                onChange={(e) => setVatSelect(e.target.value as VatSelect)}
                required
              >
                <option value="18">{t("products.vatOption18")}</option>
                <option value="0">{t("products.vatOption0")}</option>
                <option value="exempt">{t("products.vatOptionExempt")}</option>
              </select>
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
