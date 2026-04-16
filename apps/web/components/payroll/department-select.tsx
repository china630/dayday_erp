"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api-client";

type Dept = { id: string; name: string; parentId: string | null };

export function DepartmentSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (departmentId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Dept[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/hr/departments")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return;
        const data = (await res.json()) as Dept[];
        setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const list = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [rows]);

  return (
    <label className="block text-[13px] font-medium text-[#34495E]">
      {t("hrStructure.department")}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={className}
      >
        <option value="">{t("common.all")}</option>
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
}

