"use client";

import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldClass } from "../../../lib/form-classes";
import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { isValidFinCode } from "../../../lib/fin-code";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { useSubscription } from "../../../lib/subscription-context";
import { ModulePageLinks } from "../../../components/module-page-links";

function sanitizeFinInput(raw: string): string {
  return raw.replace(/[^0-9A-HJ-NP-Za-hj-np-z]/g, "").slice(0, 7);
}

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

export default function NewEmployeePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const { ready: subReady, effectiveSnapshot: snapshot } = useSubscription();
  const router = useRouter();
  const [finCode, setFinCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [positions, setPositions] = useState<
    { id: string; name: string; department: { id: string; name: string } }[]
  >([]);
  const [positionId, setPositionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [salary, setSalary] = useState("");
  const [kind, setKind] = useState<"EMPLOYEE" | "CONTRACTOR">("EMPLOYEE");
  const [voen, setVoen] = useState("");
  const [contractorSocial, setContractorSocial] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await apiFetch("/api/hr/job-positions");
      if (!res.ok) return;
      const rows = (await res.json()) as {
        id: string;
        name: string;
        department: { id: string; name: string };
      }[];
      setPositions(rows);
    })();
  }, [token]);

  useEffect(() => {
    if (positions.length > 0 && !positionId) setPositionId(positions[0].id);
  }, [positions, positionId]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !patronymic.trim() ||
      !startDate ||
      salary === "" ||
      !positionId
    ) {
      alert(t("employees.fillRequired"));
      return;
    }
    if (!isValidFinCode(finCode)) {
      alert(t("employees.finInvalidStrict"));
      return;
    }
    if (kind === "CONTRACTOR" && !/^\d{10}$/.test(voen.trim())) {
      alert(t("counterparties.taxInvalid"));
      return;
    }
    const body: Record<string, unknown> = {
      kind,
      finCode: finCode.trim(),
      firstName,
      lastName,
      patronymic: patronymic.trim(),
      positionId,
      startDate,
      salary: Number(salary),
    };
    if (kind === "CONTRACTOR") {
      body.voen = voen.trim();
      if (contractorSocial !== "") body.contractorMonthlySocialAzn = Number(contractorSocial);
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
          if (res.status === 402) return;
          const msg =
            typeof j.message === "string"
              ? j.message
              : j.message &&
                  typeof j.message === "object" &&
                  "ru" in (j.message as object)
                ? String((j.message as { ru?: string }).ru)
                : t("employees.quotaExceeded");
          alert(msg);
          return;
        }
      } catch {
        /* not JSON */
      }
      alert(raw);
      return;
    }
    router.push("/employees");
  }

  if (!ready) {
    return (
      <div className="text-gray-600">
        <p>{t("common.loading")}</p>
      </div>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-6">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/employees", labelKey: "nav.employees" },
          { href: "/payroll", labelKey: "nav.payroll" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">{t("employees.newTitle")}</h1>
      </div>

      <form
        noValidate
        onSubmit={(e) => void submitCreate(e)}
        className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 max-w-lg grid gap-4"
      >
        <div>
          <span className={lbl}>{t("employees.kind")}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "EMPLOYEE" | "CONTRACTOR")}
            className={inputFieldClass}
          >
            <option value="EMPLOYEE">{t("employees.kindEmployee")}</option>
            <option value="CONTRACTOR">{t("employees.kindContractor")}</option>
          </select>
        </div>
        <div>
          <span className={lbl}>{t("employees.fin")}</span>
          <input
            value={finCode}
            maxLength={7}
            onChange={(e) => setFinCode(sanitizeFinInput(e.target.value))}
            className={inputFieldClass}
          />
        </div>
        {kind === "CONTRACTOR" && (
          <>
            <div>
              <span className={lbl}>{t("employees.voen")}</span>
              <input
                value={voen}
                maxLength={10}
                onChange={(e) => setVoen(e.target.value.replace(/\D/g, ""))}
                className={inputFieldClass}
              />
            </div>
            <div>
              <span className={lbl}>{t("employees.contractorSocial")}</span>
              <input
                type="number"
                step="0.01"
                value={contractorSocial}
                onChange={(e) => setContractorSocial(e.target.value)}
                className={inputFieldClass}
              />
            </div>
          </>
        )}
        <div>
          <span className={lbl}>{t("employees.firstName")}</span>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("employees.lastName")}</span>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>
            {t("employees.patronymic", { defaultValue: "Ata adı (отчество)" })}
          </span>
          <input
            value={patronymic}
            onChange={(e) => setPatronymic(e.target.value)}
            className={inputFieldClass}
            required
          />
        </div>
        <div>
          <span className={lbl}>{t("employees.jobPositionSelect")}</span>
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            className={inputFieldClass}
            required
          >
            {positions.length === 0 ? (
              <option value="">{t("common.loading")}</option>
            ) : (
              positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.department.name} — {p.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <span className={lbl}>{t("employees.startDate")}</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputFieldClass} />
        </div>
        <div>
          <span className={lbl}>{t("employees.salaryGross")}</span>
          <input
            type="number"
            step="0.01"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className={inputFieldClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/employees"
            className={`${SECONDARY_BUTTON_CLASS} no-underline`}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            {t("common.back")}
          </Link>
          <button
            type="submit"
            disabled={busy || (subReady && Boolean(snapshot?.quotas.employees.atLimit))}
            title={
              subReady && snapshot?.quotas.employees.atLimit
                ? t("subscription.employeesLimitTooltip")
                : undefined
            }
            className={PRIMARY_BUTTON_CLASS}
          >
            <Save className="h-4 w-4 shrink-0" aria-hidden />
            {busy ? "…" : t("employees.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
