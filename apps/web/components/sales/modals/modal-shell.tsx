"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CARD_CONTAINER_CLASS, GHOST_BUTTON_CLASS } from "../../../lib/design-system";
import { Button } from "../../ui/button";

/** @deprecated Используйте `t("common.cancel")` / `t("common.save")` — строки оставлены для обратной совместимости импортов. */
export const SALES_MODAL_CANCEL_AZ = "Ləğv et";
/** @deprecated см. SALES_MODAL_CANCEL_AZ */
export const SALES_MODAL_SAVE_AZ = "Yadda saxla";

export function SalesModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidthClass = "max-w-2xl",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClass?: string;
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} ${maxWidthClass} flex w-full max-h-[90vh] flex-col bg-white p-6`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 pr-2">
            <h3 id="sales-modal-title" className="m-0 text-base font-semibold text-[#34495E]">
              {title}
            </h3>
            {subtitle ? <p className="mb-0 mt-1 text-[13px] text-[#7F8C8D]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className={GHOST_BUTTON_CLASS}
            onClick={onClose}
            aria-label={SALES_MODAL_CANCEL_AZ}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer != null ? (
          <div className="mt-4 shrink-0 border-t border-[#EBEDF0] pt-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function SalesModalFooter({
  onCancel,
  onSave,
  busy,
  saveDisabled,
  formId,
  /** `ghost` — прозрачная отмена (стандарт модалок); `secondary` — контурная кнопка. */
  cancelVariant = "ghost",
}: {
  onCancel: () => void;
  onSave?: () => void | Promise<void>;
  busy?: boolean;
  saveDisabled?: boolean;
  formId?: string;
  cancelVariant?: "ghost" | "secondary";
}) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-row flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant={cancelVariant === "secondary" ? "secondary" : "ghost"}
        onClick={onCancel}
        disabled={!!busy}
      >
        {t("common.cancel")}
      </Button>
      {formId ? (
        <Button
          type="submit"
          variant="primary"
          form={formId}
          disabled={!!busy || !!saveDisabled}
        >
          {busy ? "…" : t("common.save")}
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          disabled={!!busy || !!saveDisabled}
          onClick={() => void onSave?.()}
        >
          {busy ? "…" : t("common.save")}
        </Button>
      )}
    </div>
  );
}

