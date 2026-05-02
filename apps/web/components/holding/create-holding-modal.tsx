"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  MODAL_INPUT_CLASS,
} from "../../lib/design-system";
import type { SupportedCurrency } from "../../lib/currencies";
import { Button } from "../ui/button";
import { CurrencySelect } from "../ui/currency-select";

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
  const [baseCurrency, setBaseCurrency] = useState<SupportedCurrency>("AZN");

  const title = useMemo(() => t("holdingCreate.title"), [t]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setBaseCurrency("AZN");
    setBusy(false);
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
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-lg font-semibold leading-snug text-[#34495E]">{title}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("holdingCreate.subtitle")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("holdingCreate.name")}
              <input
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("holdingCreate.baseCurrency")}
              <div className="mt-1">
                <CurrencySelect
                  value={baseCurrency}
                  onValueChange={setBaseCurrency}
                  className={`block w-full ${MODAL_INPUT_CLASS}`}
                />
              </div>
            </label>
          </div>
          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : t("holdingCreate.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
