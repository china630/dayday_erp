"use client";

import type { ReactNode } from "react";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

/** Подтверждение действия (синхронизация / проведение) с футером Ləğv et / Yadda saxla. */
export function AuditDetailConfirmModal({
  open,
  title,
  onClose,
  busy,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy: boolean;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}) {
  return (
    <InventoryModalShell
      open={open}
      title={title}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      footer={
        <InventoryModalFooter onCancel={onClose} onSave={() => void onConfirm()} busy={busy} />
      }
    >
      {children ? <div className="text-[13px] text-[#7F8C8D]">{children}</div> : null}
    </InventoryModalShell>
  );
}
