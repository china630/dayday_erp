"use client";

import { Loader2, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { apiBaseUrl, apiFetch } from "../../lib/api-client";
import type { AuthUser, OrgSummary } from "../../lib/auth-context";
import { useAuth } from "../../lib/auth-context";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../lib/form-styles";
import { CARD_CONTAINER_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../../lib/design-system";

export function CreateCompanyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();

  const title = useMemo(() => t("companiesPage.modals.createCompanyTitle"), [t]);

  const [orgName, setOrgName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrgName("");
    setTaxId("");
    setBusy(false);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!orgName.trim()) {
      toast.error(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: orgName.trim(),
          taxId: taxId.replace(/\D/g, "").slice(0, 10),
          currency: "AZN",
        }),
      });
      if (!res.ok) {
        toast.error(t("companiesPage.createTitle"), {
          description: (await res.text()) || String(res.status),
        });
        return;
      }
      const data = (await res.json()) as {
        accessToken: string;
        user: AuthUser;
        organizations: OrgSummary[];
      };
      login(data.accessToken, data.user, data.organizations);
      toast.success(t("companiesPage.modals.createdOk"));
      onClose();
      router.push("/");
    } catch {
      toast.error(t("companiesPage.createTitle"), {
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
            <p className="text-sm text-slate-600 mt-1 mb-0">{t("companiesPage.modals.createCompanyHint")}</p>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("auth.orgName")}</span>
              <input
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className={FORM_INPUT_CLASS}
                autoComplete="organization"
              />
            </div>
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
                  <Save className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{t("companiesPage.createSubmit")}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

