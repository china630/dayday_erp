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
  MODAL_INPUT_NUMERIC_CLASS,
} from "../../lib/design-system";
import { Button } from "../ui/button";

type DeptFlat = { id: string; name: string; parentId: string | null };

export type JobPositionEditPayload = {
  id: string;
  departmentId: string;
  name: string;
  totalSlots: number;
  minSalary: number;
  maxSalary: number;
};

export function JobPositionModal({
  open,
  onClose,
  departments,
  onCreated,
  editingPosition,
}: {
  open: boolean;
  onClose: () => void;
  departments: DeptFlat[];
  onCreated: () => void;
  editingPosition?: JobPositionEditPayload | null;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [deptId, setDeptId] = useState("");
  const [name, setName] = useState("");
  const [slots, setSlots] = useState("1");
  const [minSalary, setMinSalary] = useState("0");
  const [maxSalary, setMaxSalary] = useState("0");

  const isEdit = Boolean(editingPosition?.id);
  const title = useMemo(
    () => (isEdit ? t("counterparties.edit") : t("hrStructure.addPosition")),
    [isEdit, t],
  );

  useEffect(() => {
    if (!open) return;
    if (editingPosition) {
      setDeptId(editingPosition.departmentId);
      setName(editingPosition.name);
      setSlots(String(editingPosition.totalSlots));
      setMinSalary(String(editingPosition.minSalary));
      setMaxSalary(String(editingPosition.maxSalary));
    } else {
      setDeptId((prev) =>
        prev && departments.some((d) => d.id === prev) ? prev : departments[0]?.id ?? "",
      );
      setName("");
      setSlots("1");
      setMinSalary("0");
      setMaxSalary("0");
    }
  }, [open, editingPosition, departments]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (departments.length === 0) {
      toast.error(t("common.fillRequired"));
      return;
    }
    if (!deptId || !name.trim()) {
      toast.error(t("common.fillRequired"));
      return;
    }
    const minN = Number(String(minSalary).replace(",", ".")) || 0;
    const maxN = Number(String(maxSalary).replace(",", ".")) || 0;
    if (minN > maxN) {
      toast.error(t("hrPositions.minMaxErr"));
      return;
    }
    const totalSlots = Math.max(1, Number(slots) || 1);

    setBusy(true);
    const body = {
      departmentId: deptId,
      name: name.trim(),
      totalSlots,
      minSalary: minN,
      maxSalary: maxN,
    };
    const res = isEdit
      ? await apiFetch(`/api/hr/job-positions/${editingPosition!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await apiFetch("/api/hr/job-positions", {
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
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("hrPositions.subtitle")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <form className="mt-4 flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("hrStructure.department")}
              <select
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                disabled={isEdit}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("hrStructure.positionName")}
              <input
                className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className={MODAL_FIELD_LABEL_CLASS}>
              {t("hrStructure.slots")}
              <input
                type="number"
                min={1}
                className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                value={slots}
                onChange={(e) => setSlots(e.target.value)}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("hrPositions.minSalary")}
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value)}
                />
              </label>
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("hrPositions.maxSalary")}
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                  value={maxSalary}
                  onChange={(e) => setMaxSalary(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : isEdit ? t("common.save") : t("hrStructure.savePosition")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
