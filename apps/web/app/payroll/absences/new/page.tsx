"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../../lib/api-client";
import { parseHrEmployeesResponse } from "../../../../lib/hr-employees-list";
import { useRequireAuth } from "../../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../../components/module-page-links";

type EmpOpt = { id: string; firstName: string; lastName: string };

export default function NewAbsencePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<EmpOpt[]>([]);
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState<"VACATION" | "SICK_LEAVE">("VACATION");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const loadEmployees = useCallback(async () => {
    if (!token) return;
    const er = await apiFetch("/api/hr/employees?page=1&pageSize=500");
    if (!er.ok) return;
    const parsed = parseHrEmployeesResponse<EmpOpt>(await er.json());
    const list = parsed.items;
    setEmployees(list);
    setEmpId((prev) => (prev && list.some((e) => e.id === prev) ? prev : list[0]?.id || ""));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadEmployees();
  }, [loadEmployees, ready, token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !empId || !from || !to) return;
    setBusy(true);
    const res = await apiFetch("/api/hr/absences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: empId,
        type,
        startDate: from,
        endDate: to,
        note,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    setNote("");
    router.push("/payroll?tab=absences");
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
    <div className="space-y-6 max-w-md">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/payroll", labelKey: "nav.payroll" },
          { href: "/employees", labelKey: "nav.employees" },
        ]}
      />
      <div>
        <Link href="/payroll?tab=absences" className="text-sm text-action hover:text-primary">
          ← {t("payroll.backPayroll")}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4">{t("payroll.absenceNew")}</h1>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="bg-white p-6 shadow-sm rounded-xl border border-slate-100 grid gap-3">
        <label className="block text-sm font-medium text-gray-700">
          {t("payroll.pickEmployee")}
          <select
            className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.lastName} {e.firstName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("payroll.absenceType")}
          <select
            className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
            value={type}
            onChange={(e) => setType(e.target.value as "VACATION" | "SICK_LEAVE")}
          >
            <option value="VACATION">{t("payroll.absenceVacation")}</option>
            <option value="SICK_LEAVE">{t("payroll.absenceSick")}</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("payroll.absenceFrom")}
          <input
            type="date"
            className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("payroll.absenceTo")}
          <input
            type="date"
            className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          {t("payroll.absenceNote")}
          <input
            className="block w-full mt-1 rounded-md border border-slate-200 px-2 py-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || employees.length === 0}
          className="bg-action text-white px-4 py-2 rounded-lg hover:bg-action-hover text-sm font-medium w-fit disabled:opacity-50"
        >
          {busy ? "…" : t("employees.save")}
        </button>
      </form>
    </div>
  );
}
