"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiFetch } from "../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../lib/design-system";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../lib/form-styles";

type DeptFlat = { id: string; name: string; parentId: string | null };

export function JobPositionModal({
  open,
  onClose,
  departments,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  departments: DeptFlat[];
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [deptId, setDeptId] = useState("");
  const [name, setName] = useState("");
  const [slots, setSlots] = useState("1");
  const [minSalary, setMinSalary] = useState("0");
  const [maxSalary, setMaxSalary] = useState("0");

  const title = useMemo(() => t("hrStructure.addPosition"), [t]);

  useEffect(() => {
    if (!open) return;
    setDeptId((prev) => (prev && departments.some((d) => d.id === prev) ? prev : departments[0]?.id ?? ""));
    setName("");
    setSlots("1");
    setMinSalary("0");
    setMaxSalary("0");
  }, [open, departments]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
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
    const res = await apiFetch("/api/hr/job-positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        departmentId: deptId,
        name: name.trim(),
        totalSlots,
        minSalary: minN,
        maxSalary: maxN,
      }),
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
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-xl bg-white p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">{title}</h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">{t("hrPositions.subtitle")}</p>
          </div>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("hrStructure.department")}</span>
              <select className={FORM_INPUT_CLASS} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className={FORM_LABEL_CLASS}>{t("hrStructure.positionName")}</span>
              <input className={FORM_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <span className={FORM_LABEL_CLASS}>{t("hrStructure.slots")}</span>
              <input
                type="number"
                min={1}
                className={FORM_INPUT_CLASS}
                value={slots}
                onChange={(e) => setSlots(e.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <span className={FORM_LABEL_CLASS}>{t("hrPositions.minSalary")}</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className={FORM_INPUT_CLASS}
                  value={minSalary}
                  onChange={(e) => setMinSalary(e.target.value)}
                />
              </div>
              <div>
                <span className={FORM_LABEL_CLASS}>{t("hrPositions.maxSalary")}</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className={FORM_INPUT_CLASS}
                  value={maxSalary}
                  onChange={(e) => setMaxSalary(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose} disabled={busy}>
              {t("common.back")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy || departments.length === 0}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : t("hrStructure.savePosition")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

