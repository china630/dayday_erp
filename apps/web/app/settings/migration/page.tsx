"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { ModulePageLinks } from "../../../components/module-page-links";
import { apiFetch } from "../../../lib/api-client";
import {
  CARD_CONTAINER_CLASS,
  INPUT_BORDERED_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../../../lib/design-system";
import { useAuth } from "../../../lib/auth-context";
import { useRequireAuth } from "../../../lib/use-require-auth";

type FinanceLine = {
  accountCode: string;
  amount: number;
  currency: string;
  date: string;
  description?: string;
};

type HrLine = {
  finCode: string;
  firstName: string;
  lastName: string;
  patronymic: string;
  positionId: string;
  hireDate: string;
  salary: number;
  kind?: string;
  initialVacationDays?: number;
  avgMonthlySalaryLastYear?: number;
  initialSalaryBalance?: number;
  voen?: string;
};

type InventoryLine = {
  productId: string;
  warehouseId: string;
  quantity: number;
  costPrice: number;
};

type JsonRecord = Record<string, unknown>;

type StepDef = {
  id: "finance" | "hr" | "inventory";
  titleKey: string;
  subtitleKey: string;
  endpoint: string;
};

const STEPS: StepDef[] = [
  {
    id: "finance",
    titleKey: "migrationWizard.steps.financeTitle",
    subtitleKey: "migrationWizard.steps.financeSubtitle",
    endpoint: "/api/migration/opening-balances/finance",
  },
  {
    id: "hr",
    titleKey: "migrationWizard.steps.hrTitle",
    subtitleKey: "migrationWizard.steps.hrSubtitle",
    endpoint: "/api/migration/opening-balances/hr",
  },
  {
    id: "inventory",
    titleKey: "migrationWizard.steps.inventoryTitle",
    subtitleKey: "migrationWizard.steps.inventorySubtitle",
    endpoint: "/api/migration/opening-balances/inventory",
  },
];

const TEMPLATE_ROWS: Record<StepDef["id"], JsonRecord[]> = {
  finance: [
    {
      accountCode: "101.01",
      amount: 10000,
      currency: "AZN",
      date: "2026-01-01",
      description: "Opening balance",
    },
  ],
  hr: [
    {
      employeeId: "EMP-001",
      finCode: "1A2B3C4",
      hireDate: "2025-01-15",
      initialVacationDays: 14,
      avgMonthlySalaryLastYear: 2400,
    },
  ],
  inventory: [
    {
      productId: "00000000-0000-0000-0000-000000000001",
      warehouseId: "00000000-0000-0000-0000-000000000002",
      quantity: 100,
      costPrice: 12.5,
    },
  ],
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function getFromAliases(row: JsonRecord, aliases: string[]): unknown {
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeHeader(key);
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return value;
    }
  }
  return undefined;
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const normalized = raw.replace(",", ".").replace(/\s+/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toOptionalString(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const value = String(raw).trim();
  return value ? value : undefined;
}

function parseFinance(rows: JsonRecord[]): FinanceLine[] {
  return rows.map((row, idx) => {
    const accountCode = toOptionalString(getFromAliases(row, ["accountCode", "account", "code"]));
    const amount = parseNumber(getFromAliases(row, ["amount", "sum", "balance"]));
    const currency = toOptionalString(getFromAliases(row, ["currency", "ccy"])) ?? "AZN";
    const date = parseDate(getFromAliases(row, ["date", "operationDate"]));
    const description = toOptionalString(getFromAliases(row, ["description", "comment", "note"]));

    if (!accountCode || amount === null || !date) {
      throw new Error(`finance row ${idx + 2}`);
    }
    return { accountCode, amount, currency, date, description };
  });
}

function parseHr(rows: JsonRecord[]): HrLine[] {
  return rows.map((row, idx) => {
    const finCode = toOptionalString(getFromAliases(row, ["finCode", "employeeId", "fin", "fincode"]));
    const firstName = toOptionalString(getFromAliases(row, ["firstName", "name"]));
    const lastName = toOptionalString(getFromAliases(row, ["lastName", "surname"]));
    const patronymic = toOptionalString(getFromAliases(row, ["patronymic", "middleName"]));
    const positionId = toOptionalString(getFromAliases(row, ["positionId", "jobPositionId"]));
    const hireDate = parseDate(getFromAliases(row, ["hireDate", "employmentDate"]));
    const salary = parseNumber(getFromAliases(row, ["salary", "monthlySalary"]));
    const kind = toOptionalString(getFromAliases(row, ["kind"]));
    const initialVacationDays = parseNumber(getFromAliases(row, ["initialVacationDays", "vacationDays"]));
    const avgMonthlySalaryLastYear = parseNumber(
      getFromAliases(row, ["avgMonthlySalaryLastYear", "avgSalaryLastYear"]),
    );
    const initialSalaryBalance = parseNumber(
      getFromAliases(row, ["initialSalaryBalance", "salaryBalance"]),
    );
    const voen = toOptionalString(getFromAliases(row, ["voen"]));

    if (!finCode || !firstName || !lastName || !patronymic || !positionId || !hireDate || salary === null) {
      throw new Error(`hr row ${idx + 2}`);
    }
    return {
      finCode,
      firstName,
      lastName,
      patronymic,
      positionId,
      hireDate,
      salary,
      kind,
      initialVacationDays: initialVacationDays ?? undefined,
      avgMonthlySalaryLastYear: avgMonthlySalaryLastYear ?? undefined,
      initialSalaryBalance: initialSalaryBalance ?? undefined,
      voen,
    };
  });
}

function parseInventory(rows: JsonRecord[]): InventoryLine[] {
  return rows.map((row, idx) => {
    const productId = toOptionalString(getFromAliases(row, ["productId", "skuId"]));
    const warehouseId = toOptionalString(getFromAliases(row, ["warehouseId", "whId"]));
    const quantity = parseNumber(getFromAliases(row, ["quantity", "qty"]));
    const costPrice = parseNumber(getFromAliases(row, ["costPrice", "unitCost", "price"]));
    if (!productId || !warehouseId || quantity === null || costPrice === null) {
      throw new Error(`inventory row ${idx + 2}`);
    }
    return { productId, warehouseId, quantity, costPrice };
  });
}

async function parseSpreadsheetFile(file: File): Promise<JsonRecord[]> {
  const xlsx = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = xlsx.read(buffer, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json<JsonRecord>(sheet, { defval: "" });
}

async function downloadStepTemplate(stepId: StepDef["id"], filename: string) {
  const xlsx = await import("xlsx");
  const rows = TEMPLATE_ROWS[stepId];
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, worksheet, "template");
  xlsx.writeFile(workbook, filename);
}

export default function MigrationSettingsPage() {
  const { t } = useTranslation();
  const { ready, token } = useRequireAuth();
  const { user } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [financeRows, setFinanceRows] = useState<FinanceLine[]>([]);
  const [hrRows, setHrRows] = useState<HrLine[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryLine[]>([]);

  const canImport = user?.role === "OWNER" || user?.role === "ACCOUNTANT";
  const step = STEPS[activeStep];

  const previewRows = useMemo(() => {
    if (step.id === "finance") return financeRows as JsonRecord[];
    if (step.id === "hr") return hrRows as JsonRecord[];
    return inventoryRows as JsonRecord[];
  }, [financeRows, hrRows, inventoryRows, step.id]);

  const previewColumns = useMemo(() => {
    if (!previewRows.length) return [];
    return Object.keys(previewRows[0]);
  }, [previewRows]);

  async function onFileSelected(file: File | null) {
    if (!file) return;
    setIsParsing(true);
    try {
      const tableRows = await parseSpreadsheetFile(file);
      if (!tableRows.length) {
        toast.error(t("migrationWizard.errors.fileEmpty"));
        return;
      }
      if (step.id === "finance") {
        setFinanceRows(parseFinance(tableRows));
      } else if (step.id === "hr") {
        setHrRows(parseHr(tableRows));
      } else {
        setInventoryRows(parseInventory(tableRows));
      }
      toast.success(t("migrationWizard.fileParsed", { rows: tableRows.length }));
    } catch {
      toast.error(t("migrationWizard.errors.fileInvalid"), {
        description: t("migrationWizard.errors.fileHint"),
      });
    } finally {
      setIsParsing(false);
    }
  }

  async function submitStep() {
    if (!token) return;
    const payload = step.id === "finance" ? financeRows : step.id === "hr" ? hrRows : inventoryRows;
    if (!payload.length) {
      toast.error(t("migrationWizard.errors.noRows"));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(step.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(t("migrationWizard.importSuccess"));
        return;
      }

      if (res.status === 409) {
        toast.error(t("migrationWizard.errors.conflict"));
        return;
      }
      if (res.status === 400) {
        const body = await res.text();
        toast.error(t("migrationWizard.errors.badRequest"), {
          description: body.slice(0, 240),
        });
        return;
      }
      toast.error(t("migrationWizard.errors.generic", { code: res.status }));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!ready || !token) {
    return <p className="text-sm text-[#7F8C8D]">{t("common.loading")}</p>;
  }

  if (!canImport) {
    return (
      <div className="space-y-4 max-w-3xl">
        <ModulePageLinks
          items={[{ href: "/", labelKey: "nav.home" }, { href: "/settings/organization", labelKey: "nav.orgCompany" }]}
        />
        <p className="text-sm text-[#7F8C8D]">{t("migrationWizard.noAccess")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <ModulePageLinks
        items={[
          { href: "/", labelKey: "nav.home" },
          { href: "/settings/organization", labelKey: "nav.orgCompany" },
          { href: "/settings/migration", labelKey: "nav.settingsMigration" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-[#34495E]">{t("migrationWizard.title")}</h1>
        <p className="text-sm text-[#7F8C8D] mt-1">{t("migrationWizard.subtitle")}</p>
      </div>

      <section className={`${CARD_CONTAINER_CLASS} p-4 space-y-4`}>
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStep(idx)}
              className={[
                "rounded border px-3 py-1.5 text-sm font-medium",
                idx === activeStep
                  ? "bg-white text-[#34495E] border-[#2980B9]"
                  : "bg-transparent text-[#7F8C8D] border-transparent hover:border-[#D5DADF]",
              ].join(" ")}
            >
              {idx + 1}. {t(s.titleKey)}
            </button>
          ))}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#34495E]">{t(step.titleKey)}</h2>
          <p className="text-sm text-[#7F8C8D] mt-1">{t(step.subtitleKey)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
            disabled={isParsing || isSubmitting}
            className={`text-sm ${INPUT_BORDERED_CLASS}`}
          />
          <button
            type="button"
            onClick={() => void submitStep()}
            disabled={isSubmitting || isParsing}
            className={PRIMARY_BUTTON_CLASS}
          >
            {isSubmitting ? t("common.loading") : t("migrationWizard.importBtn")}
          </button>
          <button
            type="button"
            onClick={() =>
              void downloadStepTemplate(
                step.id,
                step.id === "finance"
                  ? "migration-template-finance.xlsx"
                  : step.id === "hr"
                    ? "migration-template-hr.xlsx"
                    : "migration-template-inventory.xlsx",
              )
            }
            disabled={isParsing || isSubmitting}
            className={SECONDARY_BUTTON_CLASS}
          >
            <Download className="h-4 w-4" aria-hidden />
            {t("migrationWizard.downloadTemplate")}
          </button>
          <button
            type="button"
            onClick={() => setActiveStep((v) => Math.max(0, v - 1))}
            disabled={activeStep === 0}
            className={SECONDARY_BUTTON_CLASS}
          >
            {t("migrationWizard.prev")}
          </button>
          <button
            type="button"
            onClick={() => setActiveStep((v) => Math.min(STEPS.length - 1, v + 1))}
            disabled={activeStep === STEPS.length - 1}
            className={SECONDARY_BUTTON_CLASS}
          >
            {t("migrationWizard.next")}
          </button>
        </div>
        <div className="rounded-[2px] border border-[#D5DADF] bg-[#EBEDF0]/40 p-3 text-sm text-[#34495E]">
          {t("migrationWizard.formatHint")}
        </div>
      </section>

      <section className={`${CARD_CONTAINER_CLASS} overflow-x-auto`}>
        <div className="p-3 border-b border-[#D5DADF] text-sm font-semibold text-[#34495E]">
          {t("migrationWizard.previewTitle", { count: previewRows.length })}
        </div>
        {previewRows.length ? (
          <table className="min-w-full text-[13px]">
            <thead className="bg-[#EBEDF0] text-left text-[#34495E]">
              <tr>
                {previewColumns.map((key) => (
                  <th key={key} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => (
                <tr key={idx} className="border-t border-[#D5DADF]">
                  {previewColumns.map((key) => (
                    <td key={`${idx}-${key}`} className="px-3 py-2 whitespace-nowrap text-[#34495E]">
                      {String(row[key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-sm text-[#7F8C8D]">{t("migrationWizard.previewEmpty")}</p>
        )}
      </section>
    </div>
  );
}
