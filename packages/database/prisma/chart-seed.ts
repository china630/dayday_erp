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
      },
      update: {
        name: row.name,
        type,
        parentId,
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

export async function syncAzChartForOrganization(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const accounts = await loadChartJson();
  await seedChartOfAccountsForOrganization(db, organizationId, accounts);
}
