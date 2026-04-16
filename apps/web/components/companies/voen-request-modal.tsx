"use client";

import { Loader2, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiBaseUrl, apiFetch } from "../../lib/api-client";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_TEXTAREA_CLASS } from "../../lib/form-styles";
import { CARD_CONTAINER_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../../lib/design-system";

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
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/join-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxId: taxId.replace(/\D/g, "").slice(0, 10),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-xl bg-white p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 m-0">{title}</h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">{t("companiesPage.joinHint")}</p>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("auth.taxId")}</span>
              <input
                required
                pattern="\\d{10}"
                maxLength={10}
                inputMode="numeric"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className={FORM_INPUT_CLASS}
                autoComplete="off"
              />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("companiesPage.messageOptional")}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className={FORM_TEXTAREA_CLASS}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} disabled={busy}>
              {t("common.back")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  <span>{t("common.loading")}</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{t("companiesPage.joinSubmit")}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

