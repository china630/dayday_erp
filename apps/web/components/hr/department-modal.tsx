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
import { Button } from "../ui/button";

type DeptFlat = { id: string; name: string; parentId: string | null };
type EmployeeOpt = { id: string; firstName: string; lastName: string };

export type DepartmentEditPayload = {
  id: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
};

export function DepartmentModal({
  open,
  onClose,
  departments,
  employees,
  onCreated,
  editingDepartment,
}: {
  open: boolean;
  onClose: () => void;
  departments: DeptFlat[];
  employees: EmployeeOpt[];
  onCreated: () => void;
  editingDepartment?: DepartmentEditPayload | null;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [managerId, setManagerId] = useState("");

  const isEdit = Boolean(editingDepartment?.id);
  const title = useMemo(
    () => (isEdit ? t("counterparties.edit") : t("hrStructure.newDeptButton")),
    [isEdit, t],
  );

  useEffect(() => {
    if (!open) return;
    if (editingDepartment) {
      setName(editingDepartment.name);
      setParentId(editingDepartment.parentId ?? "");
      setManagerId(editingDepartment.managerId ?? "");
    } else {
      setName("");
      setParentId("");
      setManagerId("");
    }
  }, [open, editingDepartment]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      toast.error(t("common.fillRequired"));
      return;
    }
    setBusy(true);
    const body = {
      name: name.trim(),
      parentId: parentId || null,
      managerId: managerId || null,
    };
    const res = isEdit
      ? await apiFetch(`/api/hr/departments/${editingDepartment!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await apiFetch("/api/hr/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    setBusy(false);
    if (!res.ok) {
      toast.error(t("common.saveErr"), { description: await res.text() });
      return;
    }
    toast.success(t("common.save"));
    onCreated();
    onClose();
  }

  if (!open) return null;

  const parentOptions = departments.filter((d) => !isEdit || d.id !== editingDepartment?.id);

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
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("hrStructure.subtitle")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("hrStructure.deptName")}
              <input className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("hrStructure.parent")}
              <select
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">{t("hrStructure.parentRoot")}</option>
                {parentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("hrStructure.managerOptional")}
              <select
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                <option value="">{t("hrStructure.noManager")}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : isEdit ? t("common.save") : t("hrStructure.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
