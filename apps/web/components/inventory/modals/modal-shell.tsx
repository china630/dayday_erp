"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CARD_CONTAINER_CLASS, MODAL_FOOTER_ACTIONS_CLASS } from "../../../lib/design-system";
import { Button } from "../../ui/button";

/** @deprecated Используйте `t("common.cancel")` / `t("common.save")`. */
export const INVENTORY_MODAL_CANCEL_AZ = "Ləğv et";
/** @deprecated см. INVENTORY_MODAL_CANCEL_AZ */
export const INVENTORY_MODAL_SAVE_AZ = "Yadda saxla";

export function InventoryModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidthClass = "max-w-xl",
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
        aria-labelledby="inventory-modal-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3
              id="inventory-modal-title"
              className="m-0 text-lg font-semibold leading-snug text-[#34495E]"
            >
              {title}
            </h3>
            {subtitle ? (
              <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{subtitle}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="!px-2"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer != null ? <footer className="shrink-0">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function InventoryModalFooter({
  onCancel,
  onSave,
  busy,
  formId,
}: {
  onCancel: () => void;
  onSave?: () => void | Promise<void>;
  busy?: boolean;
  /** Если задан, основная кнопка отправляет форму с этим id (вместо onSave). */
  formId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={MODAL_FOOTER_ACTIONS_CLASS}>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={!!busy}>
        {t("common.cancel")}
      </Button>
      {formId ? (
        <Button type="submit" variant="primary" form={formId} disabled={!!busy}>
          {busy ? "…" : t("common.save")}
        </Button>
      ) : (
        <Button type="button" variant="primary" disabled={!!busy} onClick={() => void onSave?.()}>
          {busy ? "…" : t("common.save")}
        </Button>
      )}
    </div>
  );
}
