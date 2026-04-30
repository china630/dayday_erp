"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import { inputFieldClass } from "../../lib/form-classes";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

function decToInput(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString(): string }).toString());
  }
  return String(v);
}

export function FixedAssetModal({
  open,
  mode,
  assetId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  assetId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [invNo, setInvNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [life, setLife] = useState("60");
  const [salvage, setSalvage] = useState("0");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    if (mode === "create") {
      setName("");
      setInvNo("");
      setPurchaseDate("");
      setPurchasePrice("");
      setLife("60");
      setSalvage("0");
      setLoading(false);
      return;
    }
    if (!assetId) return;
    let cancelled = false;
    setLoading(true);
    void apiFetch(`/api/fixed-assets/${encodeURIComponent(assetId)}`).then(async (res) => {
      if (!res.ok) {
        toast.error(t("fixedAssets.loadErr"), { description: await res.text() });
        if (!cancelled) setLoading(false);
        return;
      }
      const row = (await res.json()) as {
        name: string;
        inventoryNumber: string;
        purchaseDate: string;
        purchasePrice: unknown;
        usefulLifeMonths: number;
        salvageValue: unknown;
      };
      if (cancelled) return;
      setName(row.name);
      setInvNo(row.inventoryNumber);
      setPurchaseDate(String(row.purchaseDate).slice(0, 10));
      setPurchasePrice(decToInput(row.purchasePrice));
      setLife(String(row.usefulLifeMonths));
      setSalvage(decToInput(row.salvageValue));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, mode, assetId, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || loading) return;
    setBusy(true);
    try {
      if (mode === "create") {
        const res = await apiFetch("/api/fixed-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            inventoryNumber: invNo.trim(),
            purchaseDate,
            purchasePrice: Number(purchasePrice),
            usefulLifeMonths: Number(life),
            salvageValue: Number(salvage || 0),
          }),
        });
        if (!res.ok) {
          toast.error(t("common.saveErr"), { description: await res.text() });
          return;
        }
        toast.success(t("common.save"));
        onSaved();
        onClose();
        return;
      }
      if (!assetId) return;
      const res = await apiFetch(`/api/fixed-assets/${encodeURIComponent(assetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          inventoryNumber: invNo.trim(),
          purchaseDate,
          purchasePrice: Number(purchasePrice),
          usefulLifeMonths: Number(life),
          salvageValue: Number(salvage || 0),
        }),
      });
      if (!res.ok) {
        toast.error(t("common.saveErr"), { description: await res.text() });
        return;
      }
      toast.success(t("common.save"));
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const title =
    mode === "create" ? t("fixedAssets.newTitle") : t("employees.editSection");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-lg flex-col bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <h3 className="m-0 text-base font-semibold text-[#34495E]">{title}</h3>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-600">{t("common.loading")}</p>
          ) : (
            <form id="fixed-asset-modal-form" className="grid gap-3" onSubmit={(e) => void onSubmit(e)}>
              <div>
                <span className={lbl}>{t("fixedAssets.name")}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputFieldClass}
                  required
                />
              </div>
              <div>
                <span className={lbl}>{t("fixedAssets.invNo")}</span>
                <input value={invNo} onChange={(e) => setInvNo(e.target.value)} className={inputFieldClass} />
              </div>
              <div>
                <span className={lbl}>{t("fixedAssets.commission")}</span>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className={inputFieldClass}
                />
              </div>
              <div>
                <span className={lbl}>{t("fixedAssets.initial")}</span>
                <input
                  type="number"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className={inputFieldClass}
                  required
                />
              </div>
              <div>
                <span className={lbl}>{t("fixedAssets.life")}</span>
                <input
                  type="number"
                  min={1}
                  value={life}
                  onChange={(e) => setLife(e.target.value)}
                  className={inputFieldClass}
                />
              </div>
              <div>
                <span className={lbl}>{t("fixedAssets.salvage")}</span>
                <input
                  type="number"
                  step="0.01"
                  value={salvage}
                  onChange={(e) => setSalvage(e.target.value)}
                  className={inputFieldClass}
                />
              </div>
            </form>
          )}
        </div>

        <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-[#EBEDF0] pt-4">
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          {!loading ? (
            <button
              type="submit"
              form="fixed-asset-modal-form"
              disabled={busy}
              className={PRIMARY_BUTTON_CLASS}
            >
              {busy ? "…" : t("fixedAssets.save")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
