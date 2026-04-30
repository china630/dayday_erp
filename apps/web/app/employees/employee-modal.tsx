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
import { isValidFinCode, normalizeFinInput } from "../../lib/fin-code";
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from "../../lib/form-styles";

type JobPositionOpt = {
  id: string;
  name: string;
  department: { id: string; name: string };
};

export function CreateEmployeeModal({
  open,
  onClose,
  onCreated,
  quotaAtLimit,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  quotaAtLimit: boolean;
}) {
  const { t } = useTranslation();
  const [positions, setPositions] = useState<JobPositionOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [kind, setKind] = useState<"EMPLOYEE" | "CONTRACTOR">("EMPLOYEE");
  const [finCode, setFinCode] = useState("");
  const [voen, setVoen] = useState("");
  const [contractorSocial, setContractorSocial] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [positionId, setPositionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [salary, setSalary] = useState("");

  const title = useMemo(() => t("employees.newTitle"), [t]);

  useEffect(() => {
    if (!open) return;
    setLoadErr(null);
    setLoading(true);
    void apiFetch("/api/hr/job-positions")
      .then(async (res) => {
        if (!res.ok) {
          setLoadErr(`${t("hrStructure.loadErr")}: ${res.status}`);
          setPositions([]);
          return;
        }
        const rows = (await res.json()) as JobPositionOpt[];
        setPositions(rows);
        setPositionId((prev) => (prev && rows.some((x) => x.id === prev) ? prev : rows[0]?.id ?? ""));
      })
      .catch(() => setLoadErr(t("employees.loadErr")))
      .finally(() => setLoading(false));
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    // reset fields on open
    setKind("EMPLOYEE");
    setFinCode("");
    setVoen("");
    setContractorSocial("");
    setFirstName("");
    setLastName("");
    setPatronymic("");
    setStartDate("");
    setSalary("");
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || quotaAtLimit) return;
    setLoadErr(null);

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !patronymic.trim() ||
      !startDate ||
      salary === "" ||
      !positionId
    ) {
      toast.error(t("employees.fillRequired"));
      return;
    }
    if (!isValidFinCode(finCode)) {
      toast.error(t("employees.finInvalidStrict"));
      return;
    }
    if (kind === "CONTRACTOR" && !/^\d{10}$/.test(voen.trim())) {
      toast.error(t("counterparties.taxInvalid"));
      return;
    }
    const sal = Number(String(salary).replace(",", "."));
    if (!Number.isFinite(sal) || sal < 0) {
      toast.error(t("employees.fillRequired"));
      return;
    }

    const body: Record<string, unknown> = {
      kind,
      finCode: finCode.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      patronymic: patronymic.trim(),
      positionId,
      startDate,
      salary: sal,
    };
    if (kind === "CONTRACTOR") {
      body.voen = voen.trim();
      if (contractorSocial !== "") {
        const s = Number(String(contractorSocial).replace(",", "."));
        if (Number.isFinite(s) && s >= 0) body.contractorMonthlySocialAzn = s;
      }
    }

    setBusy(true);
    const res = await apiFetch("/api/hr/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);

    if (!res.ok) {
      const raw = await res.text();
      try {
        const j = JSON.parse(raw) as { code?: string; message?: unknown };
        if (j.code === "QUOTA_EXCEEDED") {
          toast.error(t("employees.staffLimitExceeded", { defaultValue: "Штатный лимит по этой должности исчерпан" }));
          return;
        }
      } catch {
        /* ignore */
      }
      toast.error(t("common.saveErr"), { description: raw });
      return;
    }

    toast.success(t("common.save"));
    onCreated();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`${CARD_CONTAINER_CLASS} w-full max-w-2xl bg-white p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 m-0">{title}</h3>
            <p className="text-sm text-slate-600 mt-1 mb-0">{t("employees.newSection")}</p>
          </div>
          <button type="button" className={GHOST_BUTTON_CLASS} onClick={onClose} aria-label={t("common.cancel")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {loadErr ? <p className="text-sm text-red-600 mt-4 mb-0">{loadErr}</p> : null}
        {loading ? <p className="text-sm text-slate-600 mt-4 mb-0">{t("common.loading")}</p> : null}

        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className={FORM_LABEL_CLASS}>{t("employees.firstName")}</span>
              <input className={FORM_INPUT_CLASS} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("employees.lastName")}</span>
              <input className={FORM_INPUT_CLASS} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <span className={FORM_LABEL_CLASS}>{t("employees.patronymic")}</span>
              <input
                className={FORM_INPUT_CLASS}
                value={patronymic}
                onChange={(e) => setPatronymic(e.target.value)}
              />
            </div>

            <div>
              <span className={FORM_LABEL_CLASS}>{t("employees.fin")}</span>
              <input
                value={finCode}
                maxLength={7}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(e) => setFinCode(normalizeFinInput(e.target.value))}
                className={FORM_INPUT_CLASS}
              />
            </div>

            <div>
              <span className={FORM_LABEL_CLASS}>{t("employees.kind")}</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "EMPLOYEE" | "CONTRACTOR")}
                className={FORM_INPUT_CLASS}
              >
                <option value="EMPLOYEE">{t("employees.kindEmployee")}</option>
                <option value="CONTRACTOR">{t("employees.kindContractor")}</option>
              </select>
            </div>

            {kind === "CONTRACTOR" ? (
              <>
                <div>
                  <span className={FORM_LABEL_CLASS}>{t("employees.voen")}</span>
                  <input
                    value={voen}
                    maxLength={10}
                    onChange={(e) => setVoen(e.target.value.replace(/\D/g, ""))}
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div>
                  <span className={FORM_LABEL_CLASS}>{t("employees.contractorSocial")}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={contractorSocial}
                    onChange={(e) => setContractorSocial(e.target.value)}
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              </>
            ) : null}

            <div className="md:col-span-2">
              <span className={FORM_LABEL_CLASS}>{t("employees.jobPositionSelect")}</span>
              <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className={FORM_INPUT_CLASS}>
                {positions.length === 0 ? <option value="">{t("common.loading")}</option> : null}
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.department.name} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className={FORM_LABEL_CLASS}>{t("employees.startDate")}</span>
              <input type="date" className={FORM_INPUT_CLASS} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <span className={FORM_LABEL_CLASS}>{t("employees.salaryGross")}</span>
              <input
                type="number"
                step="0.01"
                min={0}
                className={FORM_INPUT_CLASS}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-row flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" className={GHOST_BUTTON_CLASS} onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={busy || loading || quotaAtLimit}>
              <Save className="h-4 w-4 shrink-0" aria-hidden />
              {busy ? "…" : t("employees.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

