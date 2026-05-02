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
import { isValidFinCode, normalizeFinInput } from "../../lib/fin-code";
import { Button } from "../../components/ui/button";

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
    if (busy) return;
    if (loading) return;
    if (quotaAtLimit) {
      toast.error(t("employees.createEmployeeQuotaFull"));
      return;
    }
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
          toast.error(
            t("employees.staffLimitExceeded", { defaultValue: "Штатный лимит по этой должности исчерпан" }),
          );
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
      <div
        className={`${CARD_CONTAINER_CLASS} flex max-h-[90vh] w-full max-w-2xl flex-col bg-white p-6`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="m-0 text-lg font-semibold leading-snug text-[#34495E]">{title}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-snug text-[#7F8C8D]">{t("employees.newSection")}</p>
          </div>
          <Button type="button" variant="ghost" className="!px-2" onClick={onClose} aria-label={t("common.close")}>
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </header>

        <div className="mt-4 flex min-h-0 flex-1 flex-col space-y-4">
        {loadErr ? <p className="m-0 text-[13px] text-red-600">{loadErr}</p> : null}
        {loading ? <p className="m-0 text-[13px] text-[#7F8C8D]">{t("common.loading")}</p> : null}

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("employees.firstName")}
                <input
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("employees.lastName")}
                <input
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
              <label className={`${MODAL_FIELD_LABEL_CLASS} md:col-span-2`}>
                {t("employees.patronymic")}
                <input
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                  value={patronymic}
                  onChange={(e) => setPatronymic(e.target.value)}
                />
              </label>

              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("employees.fin")}
                <input
                  value={finCode}
                  maxLength={7}
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(e) => setFinCode(normalizeFinInput(e.target.value))}
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS} font-mono uppercase`}
                />
              </label>

              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("employees.kind")}
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "EMPLOYEE" | "CONTRACTOR")}
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                >
                  <option value="EMPLOYEE">{t("employees.kindEmployee")}</option>
                  <option value="CONTRACTOR">{t("employees.kindContractor")}</option>
                </select>
              </label>

              {kind === "CONTRACTOR" ? (
                <>
                  <label className={MODAL_FIELD_LABEL_CLASS}>
                    {t("employees.voen")}
                    <input
                      value={voen}
                      maxLength={10}
                      onChange={(e) => setVoen(e.target.value.replace(/\D/g, ""))}
                      className={`mt-1 block w-full ${MODAL_INPUT_CLASS} font-mono tabular-nums`}
                    />
                  </label>
                  <label className={MODAL_FIELD_LABEL_CLASS}>
                    {t("employees.contractorSocial")}
                    <input
                      type="number"
                      step="0.01"
                      value={contractorSocial}
                      onChange={(e) => setContractorSocial(e.target.value)}
                      className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                    />
                  </label>
                </>
              ) : null}

              <label className={`${MODAL_FIELD_LABEL_CLASS} md:col-span-2`}>
                {t("employees.jobPositionSelect")}
                <select
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                >
                  {positions.length === 0 ? <option value="">{t("common.loading")}</option> : null}
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.department.name} — {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("employees.startDate")}
                <input
                  type="date"
                  className={`mt-1 block w-full ${MODAL_INPUT_CLASS}`}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className={MODAL_FIELD_LABEL_CLASS}>
                {t("employees.salaryGross")}
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className={`mt-1 block w-full ${MODAL_INPUT_NUMERIC_CLASS}`}
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className={MODAL_FOOTER_ACTIONS_CLASS}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "…" : t("employees.save")}
            </Button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
