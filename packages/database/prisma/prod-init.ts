import { closePrismaPool, createPrismaClient } from "./prisma-client";
import bcrypt from "bcrypt";
import { executePlatformRawUnsafe } from "./platform-raw-sql";
import { loadTemplateIfrsMappingPackage } from "./template-ifrs";

const prisma = createPrismaClient();

const SUPER_ADMINS = [
  "inaram84@gmail.com",
  "shirinov.chingiz@gmail.com",
] as const;

const DEFAULT_PASSWORD = "12345678";
const BCRYPT_ROUNDS = 10;

async function upsertSystemConfigDefaults() {
  const rows: Array<{ key: string; value: unknown }> = [
    { key: "billing.foundation_monthly_azn", value: 29 },
    { key: "billing.yearly_discount_percent", value: 20 },
  ];
  for (const r of rows) {
    await prisma.systemConfig.upsert({
      where: { key: r.key },
      create: { key: r.key, value: r.value as object },
      update: { value: r.value as object },
    });
  }
  process.stdout.write(`[prod-init] system_config: upserted ${rows.length} key(s)\n`);
}

async function seedTemplateIfrsMappings() {
  // Ensure table exists even if migrations weren't generated locally.
  // This keeps `npm run db:prod-init` working on an empty database.
  await executePlatformRawUnsafe(prisma, `
    CREATE TABLE IF NOT EXISTS "template_ifrs_mappings" (
      "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
      "nas_code" TEXT NOT NULL,
      "ifrs_code" TEXT NOT NULL,
      "ratio" DECIMAL(19,8) NOT NULL DEFAULT 1,
      "description" TEXT NOT NULL DEFAULT '',
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "template_ifrs_mappings_pkey" PRIMARY KEY ("id")
    );
  `);
  await executePlatformRawUnsafe(prisma,
    `CREATE INDEX IF NOT EXISTS "template_ifrs_mappings_nas_code_idx" ON "template_ifrs_mappings"("nas_code");`,
  );
  await executePlatformRawUnsafe(prisma,
    `CREATE INDEX IF NOT EXISTS "template_ifrs_mappings_ifrs_code_idx" ON "template_ifrs_mappings"("ifrs_code");`,
  );
  await executePlatformRawUnsafe(prisma,
    `CREATE UNIQUE INDEX IF NOT EXISTS "template_ifrs_mappings_nas_code_ifrs_code_key" ON "template_ifrs_mappings"("nas_code","ifrs_code");`,
  );

  const pkg = await loadTemplateIfrsMappingPackage();
  const defaults = pkg.overrides.map((o) => ({
    nasCode: String(o.nasCode),
    ifrsCode: String(o.ifrsCode),
    ratio: String(o.ratio ?? pkg.defaultRule.ratio ?? "1"),
    description: String(o.description ?? ""),
  }));

  for (const row of defaults) {
    await prisma.templateIFRSMapping.upsert({
      where: { nasCode_ifrsCode: { nasCode: row.nasCode, ifrsCode: row.ifrsCode } },
      create: {
        nasCode: row.nasCode,
        ifrsCode: row.ifrsCode,
        ratio: row.ratio,
        description: row.description,
      },
      update: {
        ratio: row.ratio,
        description: row.description,
      },
    });
  }
  process.stdout.write(
    `[prod-init] template_ifrs_mappings: upserted ${defaults.length} row(s) (template=${pkg.templateKey}@v${pkg.version})\n`,
  );
}

async function ensureMdmGlobalCounterpartiesSchema() {
  await executePlatformRawUnsafe(prisma, `
    CREATE TABLE IF NOT EXISTS "global_counterparties" (
      "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
      "tax_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "legal_address" TEXT,
      "vat_status" BOOLEAN,
      "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "global_counterparties_pkey" PRIMARY KEY ("id")
    );
  `);
  await executePlatformRawUnsafe(prisma,
    `CREATE UNIQUE INDEX IF NOT EXISTS "global_counterparties_tax_id_key" ON "global_counterparties"("tax_id");`,
  );

  await executePlatformRawUnsafe(prisma,
    `ALTER TABLE "counterparties" ADD COLUMN IF NOT EXISTS "global_id" UUID;`,
  );
  await executePlatformRawUnsafe(prisma,
    `CREATE INDEX IF NOT EXISTS "counterparties_global_id_idx" ON "counterparties"("global_id");`,
  );
  await executePlatformRawUnsafe(prisma, `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'counterparties_global_id_fkey'
      ) THEN
        ALTER TABLE "counterparties"
        ADD CONSTRAINT "counterparties_global_id_fkey"
        FOREIGN KEY ("global_id") REFERENCES "global_counterparties"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  process.stdout.write("[prod-init] mdm: ensured global_counterparties schema\n");
}

async function upsertSuperAdmins() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
  for (const emailRaw of SUPER_ADMINS) {
    const email = emailRaw.toLowerCase().trim();
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash: hash,
        firstName: null,
        lastName: null,
        fullName: null,
        avatarUrl: null,
        isSuperAdmin: true,
      },
      update: {
        passwordHash: hash,
        isSuperAdmin: true,
      },
    });
  }
  process.stdout.write(
    `[prod-init] users: upserted super-admins (${SUPER_ADMINS.length})\n`,
  );
}

async function ensureCriticalSchemaFixups() {
  // Keep prod-init resilient when migrations lag behind code.
  // DDL is also codified in Prisma migration `20260430120000_align_out_of_band_schema` — prefer `migrate deploy` so history matches the DB.
  // These are safe, idempotent DDL statements.
  await executePlatformRawUnsafe(prisma,
    `ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "inventory_account_code" TEXT NOT NULL DEFAULT '201';`,
  );
  await executePlatformRawUnsafe(prisma, `
    DO $$
    BEGIN
      ALTER TYPE "BankStatementLineOrigin" ADD VALUE 'MANUAL_BANK_ENTRY';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  process.stdout.write("[prod-init] schema: ensured inventory_account_code + MANUAL_BANK_ENTRY enum\n");
}

/**
 * Нормализованная инвентаризация (описи + строки). Если миграции не применились полностью,
 * Prisma падает на GET /api/inventory/audits. См. prisma/migration-inventory-audit-lines.sql.
 */
async function ensureInventoryAuditSchema() {
  // Важно: ADD COLUMN и ADD CONSTRAINT не держать в одном DO — при ошибке FK откатится и колонка пропадёт.
  await executePlatformRawUnsafe(prisma,
    `ALTER TABLE IF EXISTS "inventory_audits" ADD COLUMN IF NOT EXISTS "warehouse_id" UUID;`,
  );
  await executePlatformRawUnsafe(prisma, `
    DO $$
    BEGIN
      IF to_regclass('public.inventory_audits') IS NULL THEN
        RETURN;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_audits_warehouse_id_fkey'
      ) THEN
        ALTER TABLE "inventory_audits"
          ADD CONSTRAINT "inventory_audits_warehouse_id_fkey"
          FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE;
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN foreign_key_violation THEN NULL;
    END $$;
  `);
  await executePlatformRawUnsafe(prisma,
    `ALTER TABLE IF EXISTS "inventory_audits" DROP COLUMN IF EXISTS "items";`,
  );
  await executePlatformRawUnsafe(prisma,
    `CREATE INDEX IF NOT EXISTS "inventory_audits_org_wh_date_idx" ON "inventory_audits" ("organization_id", "warehouse_id", "date");`,
  );

  await executePlatformRawUnsafe(prisma, `
    CREATE TABLE IF NOT EXISTS "inventory_audit_lines" (
      "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
      "organization_id" UUID NOT NULL,
      "inventory_audit_id" UUID NOT NULL,
      "product_id" UUID NOT NULL,
      "system_qty" DECIMAL(19,4) NOT NULL,
      "fact_qty" DECIMAL(19,4) NOT NULL,
      "cost_price" DECIMAL(19,4) NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "inventory_audit_lines_pkey" PRIMARY KEY ("id")
    );
  `);
  await executePlatformRawUnsafe(prisma, `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_audit_lines_org_fkey') THEN
        ALTER TABLE "inventory_audit_lines"
          ADD CONSTRAINT "inventory_audit_lines_org_fkey"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_audit_lines_audit_fkey') THEN
        ALTER TABLE "inventory_audit_lines"
          ADD CONSTRAINT "inventory_audit_lines_audit_fkey"
          FOREIGN KEY ("inventory_audit_id") REFERENCES "inventory_audits"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_audit_lines_product_fkey') THEN
        ALTER TABLE "inventory_audit_lines"
          ADD CONSTRAINT "inventory_audit_lines_product_fkey"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;
      END IF;
    END $$;
  `);
  await executePlatformRawUnsafe(prisma,
    `CREATE UNIQUE INDEX IF NOT EXISTS "inventory_audit_lines_audit_product_uidx" ON "inventory_audit_lines" ("inventory_audit_id", "product_id");`,
  );
  await executePlatformRawUnsafe(prisma,
    `CREATE INDEX IF NOT EXISTS "inventory_audit_lines_org_audit_idx" ON "inventory_audit_lines" ("organization_id", "inventory_audit_id");`,
  );
  await executePlatformRawUnsafe(prisma,
    `CREATE INDEX IF NOT EXISTS "inventory_audit_lines_org_product_idx" ON "inventory_audit_lines" ("organization_id", "product_id");`,
  );
  process.stdout.write("[prod-init] schema: ensured inventory audit tables/indexes\n");
}

async function main() {
  await ensureCriticalSchemaFixups();
  await ensureInventoryAuditSchema();
  await ensureMdmGlobalCounterpartiesSchema();
  await upsertSystemConfigDefaults();
  await seedTemplateIfrsMappings();
  await upsertSuperAdmins();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closePrismaPool();
  });

