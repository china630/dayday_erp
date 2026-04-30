"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  GHOST_BUTTON_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../lib/form-styles";

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
  /** Режим редактирования; при null — создание. */
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
      <div className={`${CARD_CONTAINER_CLASS} max-h-[90vh] w-full max-w-xl overflow-y-auto bg-white p-6`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-semibold text-gray-900">{title}</h3>
            <p className="mb-0 mt-1 text-sm text-slate-600">{t("hrStructure.subtitle")}</p>
          </div>
          <button type="button" className={GHOST_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("hrStructure.deptName")}</span>
              <input className={FORM_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("hrStructure.parent")}</span>
              <select className={FORM_INPUT_CLASS} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">{t("hrStructure.parentRoot")}</option>
                {parentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("hrStructure.managerOptional")}</span>
              <select className={FORM_INPUT_CLASS} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">{t("hrStructure.noManager")}</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.lastName} {e.firstName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-row flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" className={GHOST_BUTTON_CLASS} onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : isEdit ? t("common.save") : t("hrStructure.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
