/**
 * Data migration: refresh NAS ledger account names (name_az / name_ru / name_en)
 * from the global COMMERCIAL catalog (`chart_of_accounts_entries`) by account code.
 *
 * Run from repo root (with DATABASE_URL):
 *   npm run db:migrate:nas-names --workspace=@dayday/database
 */
import { LedgerType, TemplateGroup } from "@prisma/client";
import { closePrismaPool, createPrismaClient } from "./prisma-client";

const prisma = createPrismaClient();

async function main() {
  const catalog = await prisma.chartOfAccountsEntry.findMany({
    where: { templateGroup: TemplateGroup.COMMERCIAL, isDeprecated: false },
    select: { code: true, nameAz: true, nameRu: true, nameEn: true },
  });
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  if (byCode.size === 0) {
    console.warn(
      "[data-migrate-nas-names] chart_of_accounts_entries (COMMERCIAL) is empty — run prisma db seed first.",
    );
    return;
  }

  const accounts = await prisma.account.findMany({
    where: { ledgerType: LedgerType.NAS },
    select: { id: true, code: true },
  });

  let updated = 0;
  let skipped = 0;
  for (const a of accounts) {
    const row = byCode.get(a.code);
    if (!row) {
      skipped += 1;
      continue;
    }
    await prisma.account.update({
      where: { id: a.id },
      data: {
        nameAz: row.nameAz,
        nameRu: row.nameRu,
        nameEn: row.nameEn,
      },
    });
    updated += 1;
  }

  console.info(
    `[data-migrate-nas-names] updated=${updated} skipped_no_catalog_match=${skipped} catalog_rows=${byCode.size}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePrismaPool();
    await prisma.$disconnect();
  });
