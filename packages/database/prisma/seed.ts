import { PrismaClient, PricingKind } from "@prisma/client";
import {
  loadChartJson,
  seedChartOfAccountsCatalogEntries,
  seedChartOfAccountsForOrganization,
} from "./chart-seed";
import {
  PRICING_MODULE_SEED_DEFAULTS,
  seedPricingModuleIfEmpty,
} from "./pricing-module-seed";

const prisma = new PrismaClient();

const PRICING_QUOTA_ROWS: ReadonlyArray<{
  key: string;
  kind: PricingKind;
  name: string;
  amountAzn: number;
  unitSize: number | null;
  sortOrder: number;
}> = [
  {
    key: "quota_employees_block",
    kind: PricingKind.QUOTA,
    name: "Доп. сотрудники (блок)",
    amountAzn: 15,
    unitSize: 10,
    sortOrder: 10,
  },
  {
    key: "quota_storage_gb_block",
    kind: PricingKind.QUOTA,
    name: "Доп. хранилище (блок)",
    amountAzn: 5,
    unitSize: 5,
    sortOrder: 11,
  },
  {
    key: "quota_invoices_block",
    kind: PricingKind.QUOTA,
    name: "Доп. исходящие инвойсы (блок)",
    amountAzn: 10,
    unitSize: 500,
    sortOrder: 12,
  },
];

/** Прайс v12.4: Foundation + модули из `PRICING_MODULE_SEED_DEFAULTS` + квоты. */
const DEFAULT_PRICING_ROWS: ReadonlyArray<{
  key: string;
  kind: PricingKind;
  name: string;
  amountAzn: number;
  unitSize: number | null;
  sortOrder: number;
}> = [
  {
    key: "foundation_monthly",
    kind: PricingKind.FOUNDATION,
    name: "Foundation (база на организацию)",
    amountAzn: 29,
    unitSize: null,
    sortOrder: 0,
  },
  ...PRICING_MODULE_SEED_DEFAULTS.map((m) => ({
    key: m.key,
    kind: PricingKind.MODULE,
    name: m.name,
    amountAzn: m.pricePerMonth,
    unitSize: null as number | null,
    sortOrder: m.sortOrder + 1,
  })),
  ...PRICING_QUOTA_ROWS,
];

async function seedPricingDefaults() {
  for (const row of DEFAULT_PRICING_ROWS) {
    await prisma.pricing.upsert({
      where: { key: row.key },
      create: {
        key: row.key,
        kind: row.kind,
        name: row.name,
        amountAzn: row.amountAzn,
        unitSize: row.unitSize,
        sortOrder: row.sortOrder,
      },
      update: {
        kind: row.kind,
        name: row.name,
        amountAzn: row.amountAzn,
        unitSize: row.unitSize,
        sortOrder: row.sortOrder,
      },
    });
  }
  console.info(
    `[seed] Pricing table upserted (${DEFAULT_PRICING_ROWS.length} rows, v12.4)`,
  );
}

async function main() {
  await seedPricingDefaults();
  await seedPricingModuleIfEmpty(prisma);
  const pmRows = await prisma.pricingModule.count();
  console.info(`[seed] pricing_modules: ${pmRows} row(s) (v12.4, empty → seed from PRICING_MODULE_SEED_DEFAULTS)`);

  // Супер-админ платформы не создаётся здесь: см. prisma/docker-init/01-seed-data.sql (Postgres init).

  const accounts = await loadChartJson();
  if (accounts.length === 0) {
    console.info(
      "[seed] chart-of-accounts-az.json пуст — пропуск. Добавьте JSON и перезапустите prisma db seed.",
    );
    return;
  }

  await seedChartOfAccountsCatalogEntries(prisma, accounts);
  console.info(
    `[seed] chart_of_accounts_entries upserted (${accounts.length} codes from JSON)`,
  );

  if (process.env.SEED_SYNC_CHART_ALL === "1") {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true },
    });
    for (const o of orgs) {
      await seedChartOfAccountsForOrganization(prisma, o.id, accounts);
      console.info(
        `[seed] Chart of accounts upserted for org "${o.name}" (${o.id}), ${accounts.length} rows`,
      );
    }
    return;
  }

  const demo = process.env.SEED_DEMO_ORG === "1";
  if (!demo) {
    console.info(
      "[seed] Задайте SEED_DEMO_ORG=1 (демо-организация) или SEED_SYNC_CHART_ALL=1 (все организации). Для новой организации в коде вызывайте syncAzChartForOrganization(db, organizationId).",
    );
    return;
  }

  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Demo LLC",
      taxId: "1234567890",
      currency: "AZN",
      subscriptionPlan: "mvp",
    },
    update: { name: "Demo LLC" },
  });

  await seedChartOfAccountsForOrganization(prisma, org.id, accounts);
  console.info(
    `[seed] Chart of accounts loaded for org ${org.id} (${accounts.length} accounts)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
