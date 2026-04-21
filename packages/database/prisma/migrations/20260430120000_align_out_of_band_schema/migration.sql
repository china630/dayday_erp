-- Align database with objects previously applied only via prod-init / raw SQL / db push.
-- Idempotent: safe on empty DB, drift DB, and CI `migrate deploy`.
-- Source of truth for wording: prisma/prod-init.ts, prisma/mdm-global-counterparty.sql, prisma/migration-inventory-audit-lines.sql

-- ---------------------------------------------------------------------------
-- 1) Warehouses: inventory account for audit / COGS routing
-- ---------------------------------------------------------------------------
ALTER TABLE "warehouses"
  ADD COLUMN IF NOT EXISTS "inventory_account_code" TEXT NOT NULL DEFAULT '201';

-- ---------------------------------------------------------------------------
-- 2) BankStatementLineOrigin: MANUAL_BANK_ENTRY
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TYPE "BankStatementLineOrigin" ADD VALUE 'MANUAL_BANK_ENTRY';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3) MDM: global counterparties + Counterparty.global_id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "global_counterparties" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tax_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legal_address" TEXT,
  "vat_status" BOOLEAN,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "global_counterparties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "global_counterparties_tax_id_key"
  ON "global_counterparties" ("tax_id");

ALTER TABLE "counterparties"
  ADD COLUMN IF NOT EXISTS "global_id" UUID;

CREATE INDEX IF NOT EXISTS "counterparties_global_id_idx"
  ON "counterparties" ("global_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counterparties_global_id_fkey'
  ) THEN
    ALTER TABLE "counterparties"
      ADD CONSTRAINT "counterparties_global_id_fkey"
      FOREIGN KEY ("global_id") REFERENCES "global_counterparties"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'organizations_holding_id_id_idx'
  ) THEN
    CREATE INDEX "organizations_holding_id_id_idx"
      ON "organizations" ("holding_id", "id");
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Template NAS ↔ IFRS mapping (DDL only; row seed remains in prod-init)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "template_ifrs_mappings" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "nas_code" TEXT NOT NULL,
  "ifrs_code" TEXT NOT NULL,
  "ratio" DECIMAL(19,8) NOT NULL DEFAULT 1,
  "description" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "template_ifrs_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "template_ifrs_mappings_nas_code_idx"
  ON "template_ifrs_mappings" ("nas_code");

CREATE INDEX IF NOT EXISTS "template_ifrs_mappings_ifrs_code_idx"
  ON "template_ifrs_mappings" ("ifrs_code");

CREATE UNIQUE INDEX IF NOT EXISTS "template_ifrs_mappings_nas_code_ifrs_code_key"
  ON "template_ifrs_mappings" ("nas_code", "ifrs_code");

-- ---------------------------------------------------------------------------
-- 5) Inventory audits: JSON items → warehouse_id + normalized lines
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "inventory_audits"
  ADD COLUMN IF NOT EXISTS "warehouse_id" UUID;

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

ALTER TABLE IF EXISTS "inventory_audits"
  DROP COLUMN IF EXISTS "items";

CREATE INDEX IF NOT EXISTS "inventory_audits_org_wh_date_idx"
  ON "inventory_audits" ("organization_id", "warehouse_id", "date");

CREATE TABLE IF NOT EXISTS "inventory_audit_lines" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "organization_id" UUID NOT NULL,
  "inventory_audit_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "system_qty" DECIMAL(19,4) NOT NULL,
  "fact_qty" DECIMAL(19,4) NOT NULL,
  "cost_price" DECIMAL(19,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_audit_lines_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_audit_lines_audit_product_uidx"
  ON "inventory_audit_lines" ("inventory_audit_id", "product_id");

CREATE INDEX IF NOT EXISTS "inventory_audit_lines_org_audit_idx"
  ON "inventory_audit_lines" ("organization_id", "inventory_audit_id");

CREATE INDEX IF NOT EXISTS "inventory_audit_lines_org_product_idx"
  ON "inventory_audit_lines" ("organization_id", "product_id");

-- NOT NULL on warehouse_id only when no NULLs remain (avoids failing on legacy drafts)
DO $$
BEGIN
  IF to_regclass('public.inventory_audits') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_audits' AND column_name = 'warehouse_id'
  ) AND NOT EXISTS (SELECT 1 FROM "inventory_audits" WHERE "warehouse_id" IS NULL) THEN
    ALTER TABLE "inventory_audits" ALTER COLUMN "warehouse_id" SET NOT NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
