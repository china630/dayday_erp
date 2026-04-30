"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/empty-state";
import { formatMoneyAzn } from "../../../lib/format-money";
import {
  CARD_CONTAINER_CLASS,
  PRIMARY_BUTTON_CLASS,
  BORDER_MUTED_CLASS,
} from "../../../lib/design-system";
import { JobPositionModal } from "../../../components/hr/job-position-modal";

type DeptFlat = { id: string; name: string; parentId: string | null };

type JobPositionRow = {
  id: string;
  name: string;
  totalSlots: number;
  minSalary: unknown;
  maxSalary: unknown;
  department: { id: string; name: string };
  _count: { employees: number };
};

const lbl =
  "block text-xs font-bold text-[#7F8C8D] uppercase tracking-wide mb-1.5";

export default function HrPositionsPage() {
  const { t } = useTranslation();
  const { token, ready } = useRequireAuth();
  const [flat, setFlat] = useState<DeptFlat[]>([]);
  const [positions, setPositions] = useState<JobPositionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editPosition, setEditPosition] = useState<JobPositionRow | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const [fl, jp] = await Promise.all([
      apiFetch("/api/hr/departments"),
      apiFetch("/api/hr/job-positions"),
    ]);
    if (!fl.ok) {
      setError(`${t("hrStructure.loadErr")}: ${fl.status}`);
      setFlat([]);
    } else {
      setFlat(await fl.json());
    }
    if (!jp.ok) {
      setError((e) => e ?? `${t("hrStructure.loadErr")}: ${jp.status}`);
      setPositions([]);
    } else {
      setPositions((await jp.json()) as JobPositionRow[]);
    }
    setLoading(false);
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void load();
  }, [load, ready, token]);

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
      <PageHeader
        title={t("hrPositions.title")}
        subtitle={t("hrPositions.subtitle")}
        actions={
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            onClick={() => {
              setEditPosition(null);
              setCreateOpen(true);
            }}
            disabled={flat.length === 0}
          >
            + {t("hrStructure.addPosition")}
          </button>
        }
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className={`${CARD_CONTAINER_CLASS} p-6`}>
        <h2 className="text-lg font-semibold text-[#34495E] mb-4">{t("hrPositions.tableTitle")}</h2>
        {loading && <p className="text-gray-600 text-sm">{t("common.loading")}</p>}
        {!loading && positions.length === 0 && (
          <EmptyState title={t("hrStructure.positionsEmpty")} description={t("hrStructure.positionsEmptyHint")} />
        )}
        {!loading && positions.length > 0 && (
          <div className={`overflow-x-auto rounded-[2px] border ${BORDER_MUTED_CLASS}`}>
            <table className="text-sm min-w-full">
              <thead>
                <tr className={`border-b ${BORDER_MUTED_CLASS}`}>
                  <th className="text-left p-2">{t("hrStructure.positionName")}</th>
                  <th className="text-left p-2">{t("hrStructure.department")}</th>
                  <th className="text-right p-2">{t("hrStructure.slots")}</th>
                  <th className="text-right p-2">{t("hrPositions.salaryFork")}</th>
                  <th className="text-right p-2">{t("hrStructure.positionsEmployees")}</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className={`border-t ${BORDER_MUTED_CLASS}`}>
                    <td className="p-2 font-medium text-gray-900">{p.name}</td>
                    <td className="p-2">{p.department.name}</td>
                    <td className="p-2 text-right tabular-nums">{p.totalSlots}</td>
                    <td className="p-2 text-right tabular-nums text-xs">
                      {formatMoneyAzn(p.minSalary)} — {formatMoneyAzn(p.maxSalary)}
                    </td>
                    <td className="p-2 text-right tabular-nums">{p._count.employees}</td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        className="text-sm text-action hover:underline"
                        onClick={() => {
                          setEditPosition(p);
                          setCreateOpen(true);
                        }}
                      >
                        {t("counterparties.edit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <JobPositionModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditPosition(null);
        }}
        departments={flat}
        onCreated={() => void load()}
        editingPosition={
          editPosition
            ? {
                id: editPosition.id,
                departmentId: editPosition.department.id,
                name: editPosition.name,
                totalSlots: editPosition.totalSlots,
                minSalary: Number(editPosition.minSalary),
                maxSalary: Number(editPosition.maxSalary),
              }
            : null
        }
      />
    </div>
  );
}
