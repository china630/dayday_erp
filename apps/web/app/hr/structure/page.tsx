"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { inputFieldClass } from "../../../lib/form-classes";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { ModulePageLinks } from "../../../components/module-page-links";
import { EmptyState } from "../../../components/empty-state";
import { parseHrEmployeesResponse } from "../../../lib/hr-employees-list";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
} from "../../../lib/design-system";

type TreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  children: TreeNode[];
};

type DeptFlat = { id: string; name: string; parentId: string | null };

type EmployeeOpt = {
  id: string;
  firstName: string;
  lastName: string;
};

const lbl = "block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5";

function TreeSkeleton() {
  return (
    <div className="space-y-3 pl-2 border-l border-slate-100" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-9 rounded-lg bg-slate-100 animate-pulse"
          style={{ marginLeft: i * 12 }}
        />
      ))}
    </div>
  );
}

function TreeRows({
  nodes,
  depth,
  t,
  onManagerChange,
  employees,
}: {
  nodes: TreeNode[];
  depth: number;
  t: (k: string, o?: { defaultValue?: string }) => string;
  onManagerChange: (deptId: string, managerId: string) => void;
  employees: EmployeeOpt[];
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.id} className="border-l border-slate-200 pl-3">
          <div
            className="flex flex-wrap items-center gap-2 py-2 rounded-lg bg-slate-50/80 px-2"
            style={{ marginLeft: depth * 12 }}
          >
            <span className="font-medium text-gray-900">{n.name}</span>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <span className="text-slate-500 whitespace-nowrap">{t("hrStructure.manager")}</span>
              <select
                className="rounded border border-slate-200 text-xs py-1 px-2 max-w-[220px]"
                value={n.managerId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onManagerChange(n.id, v);
                }}
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
          {n.children.length > 0 && (
            <TreeRows
              nodes={n.children}
              depth={depth + 1}
              t={t}
              onManagerChange={onManagerChange}
              employees={employees}
            />
          )}
        </div>
      ))}
    </>
  );
}

export default function HrStructurePage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [flat, setFlat] = useState<DeptFlat[]>([]);
  const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const [tr, fl, em] = await Promise.all([
      apiFetch("/api/hr/org-structure/tree"),
      apiFetch("/api/hr/departments"),
      apiFetch("/api/hr/employees?page=1&pageSize=500"),
    ]);
    if (!tr.ok) {
      setError(`${t("hrStructure.loadErr")}: ${tr.status}`);
      setTree([]);
    } else {
      setTree((await tr.json()) as TreeNode[]);
    }
    if (fl.ok) setFlat(await fl.json());
    if (em.ok) {
      const parsed = parseHrEmployeesResponse<EmployeeOpt>(await em.json());
      setEmployees(parsed.items);
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

  async function createDept(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setBusy(true);
    const res = await apiFetch("/api/hr/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        parentId: newParentId || null,
        managerId: newManagerId || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    setNewName("");
    setNewParentId("");
    setNewManagerId("");
    await load();
  }

  async function onManagerChange(deptId: string, managerId: string) {
    if (!token) return;
    const res = await apiFetch(`/api/hr/departments/${deptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId: managerId || null }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    await load();
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
    <div className="space-y-8 max-w-4xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/employees", labelKey: "nav.employees" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t("hrStructure.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("hrStructure.subtitle")}</p>
        </div>
        <a href="#yeni-bolme" className={PRIMARY_BUTTON_CLASS}>
          {t("hrStructure.newDeptButton")}
        </a>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className="bg-white p-6 shadow-sm rounded-xl border border-slate-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("hrStructure.treeTitle")}</h2>
        {loading && <TreeSkeleton />}
        {!loading && tree.length === 0 && (
          <EmptyState
            title={t("hrStructure.departmentsEmptyTitle")}
            description={t("hrStructure.departmentsEmptyHint")}
          />
        )}
        {!loading && tree.length > 0 && (
          <TreeRows
            nodes={tree}
            depth={0}
            t={t}
            onManagerChange={(id, m) => void onManagerChange(id, m)}
            employees={employees}
          />
        )}
      </section>

      <section
        id="yeni-bolme"
        className={`${CARD_CONTAINER_CLASS} p-6 border-[#2980B9]/25 scroll-mt-24`}
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("hrStructure.newDeptButton")}</h2>
        <form noValidate onSubmit={(e) => void createDept(e)} className="grid gap-4 max-w-lg">
          <div>
            <span className={lbl}>{t("hrStructure.deptName")}</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={inputFieldClass}
            />
          </div>
          <div>
            <span className={lbl}>{t("hrStructure.parent")}</span>
            <select
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
              className={inputFieldClass}
            >
              <option value="">{t("hrStructure.parentRoot")}</option>
              {flat.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={lbl}>{t("hrStructure.managerOptional")}</span>
            <select
              value={newManagerId}
              onChange={(e) => setNewManagerId(e.target.value)}
              className={inputFieldClass}
            >
              <option value="">{t("hrStructure.noManager")}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName} {e.firstName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={busy} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
            {t("hrStructure.create")}
          </button>
        </form>
      </section>
    </div>
  );
}
