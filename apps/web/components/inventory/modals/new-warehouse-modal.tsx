"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/api-client";
import { notifyInventoryListsRefresh } from "../../../lib/list-refresh-bus";
import { MODAL_FIELD_LABEL_CLASS, MODAL_INPUT_CLASS } from "../../../lib/design-system";
import { InventoryModalFooter, InventoryModalShell } from "./modal-shell";

export function NewWarehouseModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formId = "inventory-modal-new-warehouse";
  const [whName, setWhName] = useState("");
  const [whLoc, setWhLoc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWhName("");
    setWhLoc("");
    setBusy(false);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !whName.trim()) {
      toast.error(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    const res = await apiFetch("/api/inventory/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: whName.trim(), location: whLoc }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    notifyInventoryListsRefresh();
    onClose();
  }

  return (
    <InventoryModalShell
      open={open}
      title={t("inventory.warehouseNewTitle")}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      footer={
        <InventoryModalFooter onCancel={onClose} busy={busy} formId={formId} />
      }
    >
      <form id={formId} className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <label className={MODAL_FIELD_LABEL_CLASS}>
          {t("inventory.whNamePh")}
          <input
            placeholder={t("inventory.whNamePlaceholder")}
            value={whName}
            onChange={(e) => setWhName(e.target.value)}
            className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
          />
        </label>
        <label className={MODAL_FIELD_LABEL_CLASS}>
          {t("inventory.whLocPh")}
          <input
            placeholder={t("inventory.whLocPlaceholder")}
            value={whLoc}
            onChange={(e) => setWhLoc(e.target.value)}
            className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
          />
        </label>
      </form>
    </InventoryModalShell>
  );
}
