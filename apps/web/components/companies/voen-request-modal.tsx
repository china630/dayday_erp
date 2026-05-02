"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiBaseUrl, apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  MODAL_INPUT_CLASS,
} from "../../lib/design-system";
import { Button } from "../ui/button";

export function VoenRequestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const title = useMemo(() => t("companiesPage.modals.voenRequestTitle"), [t]);

  const [taxId, setTaxId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTaxId("");
    setMessage("");
    setBusy(false);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = taxId.replace(/\D/g, "").slice(0, 10);
    if (digits.length !== 10) {
      toast.error(t("common.fillRequired"));
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/join-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxId: digits,
          message: message.trim() || undefined,
        }),
      });
      if (!res.ok) {
        toast.error(t("companiesPage.joinTitle"), {
          description: (await res.text()) || String(res.status),
        });
        return;
      }
      toast.success(t("companiesPage.joinOk"));
      onClose();
    } catch {
      toast.error(t("companiesPage.joinTitle"), {
        description: t("auth.apiUnreachable", { url: apiBaseUrl() }),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const textareaClass = `mt-1 block min-h-[72px] w-full resize-y ${MODAL_INPUT_CLASS}`;

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
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("companiesPage.joinHint")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("auth.taxId")}
              <input
                maxLength={10}
                inputMode="numeric"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS} font-mono tabular-nums`}
                autoComplete="off"
              />
            </label>
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("companiesPage.messageOptional")}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className={textareaClass}
              />
            </label>
          </div>
          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  {t("common.loading")}
                </>
              ) : (
                t("companiesPage.joinSubmit")
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
