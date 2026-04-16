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

export function CreateHoldingModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: { id: string; name: string; baseCurrency?: string }) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState<"AZN" | "USD" | "EUR">("AZN");

  const title = useMemo(() => t("holdingCreate.title"), [t]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setBaseCurrency("AZN");
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      toast.error(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        baseCurrency,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("holdingCreate.createErr"), { description: await res.text() });
      return;
    }
    const created = (await res.json()) as {
      id: string;
      name: string;
      baseCurrency?: string;
    };
    toast.success(t("holdingCreate.createdOk"));
    onCreated(created);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-xl bg-white p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">{title}</h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">
              {t("holdingCreate.subtitle")}
            </p>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("holdingCreate.name")}</span>
              <input className={FORM_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("holdingCreate.baseCurrency")}</span>
              <select
                className={FORM_INPUT_CLASS}
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as "AZN" | "USD" | "EUR")}
              >
                <option value="AZN">AZN</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} disabled={busy}>
              {t("common.back")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : t("holdingCreate.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

