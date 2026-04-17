"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";

/** Стандартные подписи футера для модулей anbar (по ТЗ). */
export const INVENTORY_MODAL_CANCEL_AZ = "Ləğv et";
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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`${CARD_CONTAINER_CLASS} ${maxWidthClass} flex w-full max-h-[90vh] flex-col bg-white p-6`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-modal-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 pr-2">
            <h3 id="inventory-modal-title" className="m-0 text-base font-semibold text-[#34495E]">
              {title}
            </h3>
            {subtitle ? (
              <p className="mb-0 mt-1 text-[13px] text-[#7F8C8D]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={onClose}
            aria-label={INVENTORY_MODAL_CANCEL_AZ}
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

export function InventoryModalFooter({
  onCancel,
  onSave,
  busy,
  saveDisabled,
  formId,
}: {
  onCancel: () => void;
  onSave?: () => void | Promise<void>;
  busy?: boolean;
  saveDisabled?: boolean;
  /** Если задан, кнопка «Yadda saxla» отправляет форму с этим id (вместо onSave). */
  formId?: string;
}) {
  return (
    <div className="flex w-full flex-col-reverse gap-2 lg:flex-row lg:w-auto lg:justify-end">
      <button
        type="button"
        className={`${SECONDARY_BUTTON_CLASS} w-full justify-center lg:w-auto`}
        onClick={onCancel}
        disabled={!!busy}
      >
        {INVENTORY_MODAL_CANCEL_AZ}
      </button>
      {formId ? (
        <button
          type="submit"
          form={formId}
          className={`${PRIMARY_BUTTON_CLASS} w-full justify-center lg:w-auto`}
          disabled={!!busy || !!saveDisabled}
        >
          {busy ? "…" : INVENTORY_MODAL_SAVE_AZ}
        </button>
      ) : (
        <button
          type="button"
          className={`${PRIMARY_BUTTON_CLASS} w-full justify-center lg:w-auto`}
          disabled={!!busy || !!saveDisabled}
          onClick={() => void onSave?.()}
        >
          {busy ? "…" : INVENTORY_MODAL_SAVE_AZ}
        </button>
      )}
    </div>
  );
}
