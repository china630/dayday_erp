-- Inventory audit: breaking change (items JSON -> normalized lines)
-- NOTE: Legacy JSON data is NOT migrated by design.
--
-- If legacy rows exist in "inventory_audits", this script may fail when enforcing NOT NULL on warehouse_id.
-- That's expected: delete test/legacy audits before applying.

BEGIN;

-- 1) Warehouses: default inventory account for audits
ALTER TABLE "warehouses"
  ADD COLUMN IF NOT EXISTS "inventory_account_code" TEXT NOT NULL DEFAULT '201';

-- 2) Inventory audits: strict one-audit-per-warehouse
ALTER TABLE "inventory_audits"
  ADD COLUMN IF NOT EXISTS "warehouse_id" UUID;

ALTER TABLE "inventory_audits"
  ALTER COLUMN "warehouse_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_audits_warehouse_id_fkey'
  ) THEN
    ALTER TABLE "inventory_audits"
      ADD CONSTRAINT "inventory_audits_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "inventory_audits"
  DROP COLUMN IF EXISTS "items";

CREATE INDEX IF NOT EXISTS "inventory_audits_org_wh_date_idx"
  ON "inventory_audits" ("organization_id", "warehouse_id", "date");

-- 3) Normalized audit lines
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

COMMIT;

