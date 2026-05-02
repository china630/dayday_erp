"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { apiBaseUrl, apiFetch } from "../../lib/api-client";
import type { AuthUser, OrgSummary } from "../../lib/auth-context";
import { useAuth } from "../../lib/auth-context";
import {
  CARD_CONTAINER_CLASS,
  MODAL_CHECKBOX_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_FOOTER_ACTIONS_CLASS,
  MODAL_INPUT_CLASS,
} from "../../lib/design-system";
import { Button } from "../ui/button";

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
  const [coaTemplate, setCoaTemplate] = useState<"full" | "small">("full");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrgName("");
    setTaxId("");
    setCoaTemplate("full");
    setBusy(false);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!orgName.trim()) {
      toast.error(t("common.fillRequired"));
      return;
    }
    const digits = taxId.replace(/\D/g, "").slice(0, 10);
    if (digits.length !== 10) {
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
          taxId: digits,
          currency: "AZN",
          coaTemplate,
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
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-lg font-semibold leading-snug text-[#34495E]">{title}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">
              {t("companiesPage.modals.createCompanyHint")}
            </p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("auth.orgName")}
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                autoComplete="organization"
              />
            </label>
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
            <fieldset className="m-0 border-0 p-0">
              <legend className={MODAL_FIELD_LABEL_CLASS}>{t("companiesPage.coaTemplateLabel")}</legend>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-[#34495E]">
                <input
                  type="radio"
                  name="coaTemplate"
                  checked={coaTemplate === "full"}
                  onChange={() => setCoaTemplate("full")}
                  className={MODAL_CHECKBOX_CLASS}
                />
                {t("companiesPage.coaTemplateFull")}
              </label>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-[#34495E]">
                <input
                  type="radio"
                  name="coaTemplate"
                  checked={coaTemplate === "small"}
                  onChange={() => setCoaTemplate("small")}
                  className={MODAL_CHECKBOX_CLASS}
                />
                {t("companiesPage.coaTemplateSmall")}
              </label>
            </fieldset>
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
                t("companiesPage.createSubmit")
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
