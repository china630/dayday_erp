"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import {
  MODAL_FIELD_LABEL_CLASS,
  MODAL_INPUT_CLASS,
} from "../../../lib/design-system";
import { Button } from "../../../components/ui/button";
import { NumericAmountInput } from "../../../components/ui/numeric-amount-input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../../components/ui/select";
import { SalesModalFooter, SalesModalShell } from "../../../components/sales/modals/modal-shell";

export type ProductModalCreateAs = "product" | "service";

type ProductDto = {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  vatRate: unknown;
  isService?: boolean;
};

type VatSelect = "18" | "8" | "2" | "0" | "exempt";

function vatSelectFromDto(vatRate: unknown): VatSelect {
  const n = Number(String(vatRate ?? 18));
  if (n === -1) return "exempt";
  if (n === 0) return "0";
  if (n === 2) return "2";
  if (n === 8) return "8";
  return "18";
}

function vatSelectToApi(v: VatSelect): number {
  if (v === "exempt") return -1;
  if (v === "0") return 0;
  if (v === "2") return 2;
  if (v === "8") return 8;
  return 18;
}

const lbl = MODAL_FIELD_LABEL_CLASS;

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
    <SalesModalShell
      open={open}
      title={title}
      subtitle={t("products.subtitle")}
      onClose={onClose}
      maxWidthClass="max-w-2xl"
      footer={
        <SalesModalFooter
          onCancel={onClose}
          busy={busy || loading}
          formId="product-modal-form"
          cancelVariant="ghost"
        />
      }
    >
      <div className="space-y-4">
        {loadErr ? <p className="text-[13px] text-red-600">{loadErr}</p> : null}
        {loading ? <p className="text-[13px] text-[#7F8C8D]">{t("common.loading")}</p> : null}

        <form
          id="product-modal-form"
          className="space-y-4"
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <span className={lbl}>{t("products.name")}</span>
            <input
              className={MODAL_INPUT_CLASS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {showSkuField ? (
            <div>
              <span className={lbl}>{t("products.sku")}</span>
              <input
                className={MODAL_INPUT_CLASS}
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                required
              />
            </div>
          ) : null}

          <div className={showSkuField ? "" : "md:col-span-2"}>
            <span className={lbl}>{t("products.vat")}</span>
            <Select
              value={vatSelect}
              onValueChange={(v) => setVatSelect(v as VatSelect)}
              className={MODAL_INPUT_CLASS}
            >
              <SelectTrigger className="" />
              <SelectContent>
                <SelectItem value="18">{t("products.vatOption18")}</SelectItem>
                <SelectItem value="8">{t("products.vatOption8")}</SelectItem>
                <SelectItem value="2">{t("products.vatOption2")}</SelectItem>
                <SelectItem value="0">{t("products.vatOption0")}</SelectItem>
                <SelectItem value="exempt">{t("products.vatOptionExempt")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <span className={lbl}>{t("products.price")}</span>
            <NumericAmountInput
              value={price}
              onValueChange={setPrice}
              decimalScale={4}
              required
            />
          </div>
          </div>
        </form>
      </div>
    </SalesModalShell>
  );
}
