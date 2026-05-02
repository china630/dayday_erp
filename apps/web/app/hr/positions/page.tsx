"use client";

import { Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../../lib/api-client";
import { useRequireAuth } from "../../../lib/use-require-auth";
import { PageHeader } from "../../../components/layout/page-header";
import { EmptyState } from "../../../components/empty-state";
import { formatMoneyAzn } from "../../../lib/format-money";
import {
  CARD_CONTAINER_CLASS,
  DATA_TABLE_ACTIONS_TD_CLASS,
  DATA_TABLE_ACTIONS_TH_CLASS,
  DATA_TABLE_CLASS,
  DATA_TABLE_HEAD_ROW_CLASS,
  DATA_TABLE_TD_CLASS,
  DATA_TABLE_TD_RIGHT_CLASS,
  DATA_TABLE_TH_LEFT_CLASS,
  DATA_TABLE_TH_RIGHT_CLASS,
  DATA_TABLE_TR_CLASS,
  DATA_TABLE_VIEWPORT_CLASS,
  PRIMARY_BUTTON_CLASS,
  TABLE_ROW_ICON_BTN_CLASS,
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
          <div className={DATA_TABLE_VIEWPORT_CLASS}>
            <table className={`${DATA_TABLE_CLASS} min-w-full`}>
              <thead>
                <tr className={DATA_TABLE_HEAD_ROW_CLASS}>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("hrStructure.positionName")}</th>
                  <th className={DATA_TABLE_TH_LEFT_CLASS}>{t("hrStructure.department")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("hrStructure.slots")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>{t("hrPositions.salaryFork")}</th>
                  <th className={DATA_TABLE_TH_RIGHT_CLASS}>
                    {t("hrStructure.positionsEmployees")}
                  </th>
                  <th className={DATA_TABLE_ACTIONS_TH_CLASS}>{t("teamPage.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className={DATA_TABLE_TR_CLASS}>
                    <td className={`${DATA_TABLE_TD_CLASS} font-semibold text-[#34495E]`}>{p.name}</td>
                    <td className={DATA_TABLE_TD_CLASS}>{p.department.name}</td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{p.totalSlots}</td>
                    <td className={`${DATA_TABLE_TD_RIGHT_CLASS} text-xs`}>
                      {formatMoneyAzn(p.minSalary)} — {formatMoneyAzn(p.maxSalary)}
                    </td>
                    <td className={DATA_TABLE_TD_RIGHT_CLASS}>{p._count.employees}</td>
                    <td className={DATA_TABLE_ACTIONS_TD_CLASS}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className={TABLE_ROW_ICON_BTN_CLASS}
                          title={t("counterparties.edit")}
                          onClick={() => {
                            setEditPosition(p);
                            setCreateOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 text-[#7F8C8D]" aria-hidden />
                        </button>
                      </div>
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
