import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AccountType,
  LedgerType,
  PrismaClient,
  type Prisma,
} from "@prisma/client";

/** Ожидаемая форма строки в JSON плана счетов */
export type ChartAccountSeed = {
  code: string;
  name: string;
  type: keyof typeof AccountType | AccountType;
  parentCode?: string | null;
};

export type ChartOfAccountsFile = {
  accounts: ChartAccountSeed[];
  meta?: Record<string, unknown>;
};

function toAccountType(value: string): AccountType {
  const upper = String(value).toUpperCase();
  if (upper in AccountType) {
    return AccountType[upper as keyof typeof AccountType];
  }
  throw new Error(`Unknown AccountType: ${value}`);
}

/**
 * Platform template rows live in `chart_of_accounts_entries` (NAS catalog); this copies them
 * into tenant `accounts` for one organization (used by API onboarding, not by ad-hoc seed).
 *
 * Идемпотентно создаёт/обновляет счета организации из массива (сначала корни, затем дочерние).
 */
export async function seedChartOfAccountsForOrganization(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  accounts: ChartAccountSeed[],
): Promise<void> {
  if (accounts.length === 0) {
    return;
  }

  const byCode = new Map<string, { data: ChartAccountSeed; id?: string }>();
  for (const row of accounts) {
    byCode.set(row.code, { data: row });
  }

  const roots = accounts.filter((a) => !a.parentCode);
  const children = accounts.filter((a) => a.parentCode);

  async function upsertOne(row: ChartAccountSeed, parentId: string | null) {
    const type = toAccountType(row.type as string);
    const catalogRow = await db.chartOfAccountsEntry.findUnique({
      where: { code: row.code },
    });
    const account = await db.account.upsert({
      where: {
        organizationId_code_ledgerType: {
          organizationId,
          code: row.code,
          ledgerType: LedgerType.NAS,
        },
      },
      create: {
        organizationId,
        code: row.code,
        name: row.name,
        type,
        ledgerType: LedgerType.NAS,
        parentId,
        chartEntryId: catalogRow?.id ?? null,
      },
      update: {
        name: row.name,
        type,
        parentId,
        ...(catalogRow && { chartEntryId: catalogRow.id }),
      },
    });
    const entry = byCode.get(row.code);
    if (entry) entry.id = account.id;
    return account;
  }

  for (const row of roots) {
    await upsertOne(row, null);
  }

  let remaining = [...children];
  let guard = 0;
  while (remaining.length > 0 && guard < accounts.length + 10) {
    guard += 1;
    const next: ChartAccountSeed[] = [];
    for (const row of remaining) {
      const parent = row.parentCode ? byCode.get(row.parentCode) : undefined;
      const parentId = parent?.id ?? null;
      if (!row.parentCode || parentId) {
        await upsertOne(row, parentId);
      } else {
        next.push(row);
      }
    }
    if (next.length === remaining.length) {
      throw new Error(
        `Chart of accounts: unresolved parentCode references: ${next.map((r) => r.code).join(", ")}`,
      );
    }
    remaining = next;
  }
}

/** JSON плана счетов: рядом с пакетом database (seeds/). */
export function chartOfAccountsAzJsonPath(): string {
  return join(__dirname, "..", "seeds", "chart-of-accounts-az.json");
}

export async function loadChartJson(): Promise<ChartAccountSeed[]> {
  const path = chartOfAccountsAzJsonPath();
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as ChartOfAccountsFile;
  if (!parsed || !Array.isArray(parsed.accounts)) {
    throw new Error('chart-of-accounts-az.json: expected { "accounts": [...] }');
  }
  return parsed.accounts;
}

/**
 * Глобальный справочник `chart_of_accounts_entries` из того же JSON, что и счета организаций.
 */
export async function seedChartOfAccountsCatalogEntries(
  db: PrismaClient | Prisma.TransactionClient,
  accounts: ChartAccountSeed[],
): Promise<void> {
  const seen = new Set<string>();
  for (const row of accounts) {
    if (seen.has(row.code)) continue;
    seen.add(row.code);
    const type = toAccountType(row.type as string);
    let cashProfile: string | null = null;
    if (row.code === "101" || row.code.startsWith("101.")) {
      cashProfile = "AZN";
    } else if (row.code === "102" || row.code.startsWith("102.")) {
      cashProfile = "FX";
    }
    await db.chartOfAccountsEntry.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        accountType: type,
        parentCode: row.parentCode?.trim() || null,
        cashProfile,
        sortOrder: 0,
        isDeprecated: false,
      },
      update: {
        name: row.name,
        accountType: type,
        parentCode: row.parentCode?.trim() || null,
        cashProfile,
      },
    });
  }
}

/**
 * Платформенный шаблон NAS из `chart_of_accounts_entries` (супер-админ UI).
 * Только строки без isDeprecated; порядок — sortOrder, затем code.
 */
export async function loadChartTemplateFromDb(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<ChartAccountSeed[]> {
  const rows = await db.chartOfAccountsEntry.findMany({
    where: { isDeprecated: false },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    type: r.accountType,
    parentCode: r.parentCode?.trim() || null,
  }));
}

export async function syncAzChartForOrganization(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const catalogCount = await db.chartOfAccountsEntry.count();
  let accounts: ChartAccountSeed[];
  if (catalogCount > 0) {
    accounts = await loadChartTemplateFromDb(db);
  } else {
    accounts = await loadChartJson();
    await seedChartOfAccountsCatalogEntries(db, accounts);
  }
  await seedChartOfAccountsForOrganization(db, organizationId, accounts);
}
