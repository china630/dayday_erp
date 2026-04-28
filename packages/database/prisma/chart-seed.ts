import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AccountType,
  CoaTemplateProfile,
  LedgerType,
  PrismaClient,
  TemplateGroup,
  type Prisma,
} from "@prisma/client";
import {
  type ChartAccountSeed,
  type ChartOfAccountsFile,
  getNasCommercialFullAccounts,
  getNasSmallBusinessAccounts,
  NAS_SMALL_BUSINESS_CODES,
} from "./nas-chart-commercial-data";

export type { ChartAccountSeed, ChartOfAccountsFile } from "./nas-chart-commercial-data";

function toAccountType(value: string): AccountType {
  const upper = String(value).toUpperCase();
  if (upper in AccountType) {
    return AccountType[upper as keyof typeof AccountType];
  }
  throw new Error(`Unknown AccountType: ${value}`);
}

/** Нормализация строки JSON (устаревшее поле `name` → AZ/RU/EN). */
export function normalizeChartAccountSeedRow(raw: Record<string, unknown>): ChartAccountSeed {
  const code = String(raw.code ?? "").trim();
  if (!code) throw new Error("Chart row: missing code");
  const type = String(raw.type ?? "ASSET");
  const parentCode =
    raw.parentCode != null && String(raw.parentCode).trim() !== ""
      ? String(raw.parentCode).trim()
      : null;
  const nameAz = String(raw.nameAz ?? raw.name_az ?? "").trim();
  const nameRu = String(raw.nameRu ?? raw.name_ru ?? "").trim();
  const nameEn = String(raw.nameEn ?? raw.name_en ?? "").trim();
  const legacyName = String(raw.name ?? "").trim();
  const az = nameAz || legacyName;
  const ru = nameRu || legacyName;
  const en = nameEn || legacyName;
  if (!az || !ru || !en) {
    throw new Error(`Chart row ${code}: nameAz/nameRu/nameEn (or legacy name) required`);
  }
  return { code, nameAz: az, nameRu: ru, nameEn: en, type: type as ChartAccountSeed["type"], parentCode };
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
  templateGroup: TemplateGroup = TemplateGroup.COMMERCIAL,
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
    const catalogRow = await db.chartOfAccountsEntry.findFirst({
      where: { templateGroup, code: row.code },
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
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
        type,
        ledgerType: LedgerType.NAS,
        parentId,
        chartEntryId: catalogRow?.id ?? null,
      },
      update: {
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
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

/**
 * Загрузка плана: при наличии валидного `chart-of-accounts-az.json` — из файла;
 * иначе встроенный полный NAS (DayDay + расширение MMÜS).
 */
export async function loadChartJson(): Promise<ChartAccountSeed[]> {
  try {
    const path = chartOfAccountsAzJsonPath();
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as ChartOfAccountsFile;
    if (parsed && Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
      return (parsed.accounts as Record<string, unknown>[]).map(normalizeChartAccountSeedRow);
    }
  } catch {
    // fall through
  }
  return getNasCommercialFullAccounts();
}

export function loadNasCommercialFullAccountsSync(): ChartAccountSeed[] {
  return getNasCommercialFullAccounts();
}

export function loadNasSmallBusinessAccountsSync(): ChartAccountSeed[] {
  return getNasSmallBusinessAccounts();
}

/**
 * Глобальный справочник `chart_of_accounts_entries` из того же JSON, что и счета организаций.
 */
export async function seedChartOfAccountsCatalogEntries(
  db: PrismaClient | Prisma.TransactionClient,
  accounts: ChartAccountSeed[],
  templateGroup: TemplateGroup = TemplateGroup.COMMERCIAL,
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
      where: {
        templateGroup_code: {
          templateGroup,
          code: row.code,
        },
      },
      create: {
        templateGroup,
        code: row.code,
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
        accountType: type,
        parentCode: row.parentCode?.trim() || null,
        cashProfile,
        sortOrder: 0,
        isDeprecated: false,
      },
      update: {
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
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
  templateGroup: TemplateGroup = TemplateGroup.COMMERCIAL,
): Promise<ChartAccountSeed[]> {
  const rows = await db.chartOfAccountsEntry.findMany({
    where: { isDeprecated: false, templateGroup },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map((r) => ({
    code: r.code,
    nameAz: r.nameAz,
    nameRu: r.nameRu,
    nameEn: r.nameEn,
    type: r.accountType,
    parentCode: r.parentCode?.trim() || null,
  }));
}

export async function syncAzChartForOrganization(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  templateGroup: TemplateGroup = TemplateGroup.COMMERCIAL,
): Promise<void> {
  const catalogCount = await db.chartOfAccountsEntry.count({
    where: { templateGroup },
  });
  let accounts: ChartAccountSeed[];
  if (catalogCount > 0) {
    accounts = await loadChartTemplateFromDb(db, templateGroup);
  } else {
    accounts =
      templateGroup === TemplateGroup.SMALL_BUSINESS
        ? getNasSmallBusinessAccounts()
        : await loadChartJson();
    await seedChartOfAccountsCatalogEntries(db, accounts, templateGroup);
  }
  await seedChartOfAccountsForOrganization(
    db,
    organizationId,
    accounts,
    templateGroup,
  );
}

/** Онбординг: `coaTemplate` (full/small) или устаревший `templateGroup` → профиль NAS. */
export function resolveCoaTemplateProfileFromDto(input: {
  coaTemplate?: "full" | "small" | string;
  templateGroup?: TemplateGroup;
}): CoaTemplateProfile {
  if (input.coaTemplate === "small") return CoaTemplateProfile.COMMERCIAL_SMALL;
  if (input.coaTemplate === "full") return CoaTemplateProfile.COMMERCIAL_FULL;
  if (input.templateGroup === TemplateGroup.SMALL_BUSINESS) {
    return CoaTemplateProfile.COMMERCIAL_SMALL;
  }
  if (input.templateGroup === TemplateGroup.GOVERNMENT) {
    return CoaTemplateProfile.COMMERCIAL_FULL;
  }
  return CoaTemplateProfile.COMMERCIAL_FULL;
}

/** Значение `organizations.settings.templateGroup` для payroll / совместимости. */
export function coaProfileToSettingsTemplateGroup(
  profile: CoaTemplateProfile,
): "COMMERCIAL" | "SMALL_BUSINESS" {
  return profile === CoaTemplateProfile.COMMERCIAL_SMALL
    ? "SMALL_BUSINESS"
    : "COMMERCIAL";
}

function cashProfileForNasCode(code: string): string | null {
  if (code === "101" || code.startsWith("101.")) return "AZN";
  if (code === "102" || code.startsWith("102.")) return "FX";
  return null;
}

/**
 * Глобальный справочник `template_accounts` (официальный / полный NAS в терминах продукта).
 * Идемпотентный upsert по `code`.
 */
export async function upsertGlobalNasTemplateAccounts(
  db: PrismaClient | Prisma.TransactionClient,
): Promise<number> {
  const rows = await loadChartJson();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const type = toAccountType(String(row.type));
    const inSmall = NAS_SMALL_BUSINESS_CODES.has(row.code);
    const templateGroups = inSmall
      ? [CoaTemplateProfile.COMMERCIAL_FULL, CoaTemplateProfile.COMMERCIAL_SMALL]
      : [CoaTemplateProfile.COMMERCIAL_FULL];
    const cashProfile = cashProfileForNasCode(row.code);
    await db.templateAccount.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
        accountType: type,
        parentCode: row.parentCode?.trim() || null,
        cashProfile,
        sortOrder: i,
        isDeprecated: false,
        templateGroups,
      },
      update: {
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
        accountType: type,
        parentCode: row.parentCode?.trim() || null,
        cashProfile,
        sortOrder: i,
        templateGroups,
      },
    });
  }
  return rows.length;
}

/**
 * Копирование NAS в `accounts` организации из `template_accounts` по профилю (Small / Full).
 */
export async function seedOrganizationNasFromTemplateAccounts(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  profile: CoaTemplateProfile,
): Promise<void> {
  const tplRows = await db.templateAccount.findMany({
    where: {
      isDeprecated: false,
      templateGroups: { has: profile },
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  if (tplRows.length === 0) {
    return;
  }

  const byCode = new Map<string, { row: (typeof tplRows)[0]; id?: string }>();
  for (const row of tplRows) {
    byCode.set(row.code, { row });
  }

  const roots = tplRows.filter((a) => !a.parentCode?.trim());
  const children = tplRows.filter((a) => a.parentCode?.trim());

  async function upsertOne(row: (typeof tplRows)[0], parentId: string | null) {
    const catalogRow = await db.chartOfAccountsEntry.findFirst({
      where: { templateGroup: TemplateGroup.COMMERCIAL, code: row.code },
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
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
        type: row.accountType,
        ledgerType: LedgerType.NAS,
        parentId,
        chartEntryId: catalogRow?.id ?? null,
        templateAccountId: row.id,
      },
      update: {
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
        type: row.accountType,
        parentId,
        ...(catalogRow ? { chartEntryId: catalogRow.id } : {}),
        templateAccountId: row.id,
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
  while (remaining.length > 0 && guard < tplRows.length + 10) {
    guard += 1;
    const next: typeof tplRows = [];
    for (const row of remaining) {
      const parent = row.parentCode?.trim()
        ? byCode.get(row.parentCode.trim())
        : undefined;
      const parentId = parent?.id ?? null;
      if (!row.parentCode?.trim() || parentId) {
        await upsertOne(row, parentId);
      } else {
        next.push(row);
      }
    }
    if (next.length === remaining.length) {
      throw new Error(
        `Template NAS: unresolved parentCode: ${next.map((r) => r.code).join(", ")}`,
      );
    }
    remaining = next;
  }
}

/**
 * Онбординг: при непустом `template_accounts` — копирование оттуда; иначе legacy `chart_of_accounts_entries`.
 */
export async function provisionNasAccountsForOrganization(
  db: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  profile: CoaTemplateProfile,
): Promise<void> {
  const totalTpl = await db.templateAccount.count();
  if (totalTpl === 0) {
    const templateGroup =
      profile === CoaTemplateProfile.COMMERCIAL_SMALL
        ? TemplateGroup.SMALL_BUSINESS
        : TemplateGroup.COMMERCIAL;
    await syncAzChartForOrganization(db, organizationId, templateGroup);
    return;
  }
  await seedOrganizationNasFromTemplateAccounts(db, organizationId, profile);
}

/** Отображаемое имя счёта по локали UI (`az` по умолчанию). */
export function pickAccountDisplayName(
  row: { nameAz: string; nameRu: string; nameEn: string },
  locale?: string | null,
): string {
  const raw = (locale ?? "az").trim().toLowerCase();
  const two = raw.startsWith("en") ? "en" : raw.startsWith("ru") ? "ru" : "az";
  if (two === "ru") return row.nameRu || row.nameAz;
  if (two === "en") return row.nameEn || row.nameAz;
  return row.nameAz || row.nameRu;
}
