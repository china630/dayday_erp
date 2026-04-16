-- MDM: GlobalCounterparty + Counterparty.global_id + org holding index
-- Apply via: npm run db:execute -- --schema prisma/schema.prisma --file prisma/mdm-global-counterparty.sql

-- 1) Global registry table
CREATE TABLE IF NOT EXISTS "global_counterparties" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tax_id" text NOT NULL,
  "name" text NOT NULL,
  "legal_address" text,
  "vat_status" boolean,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "global_counterparties_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'global_counterparties_tax_id_key'
  ) THEN
    CREATE UNIQUE INDEX "global_counterparties_tax_id_key"
      ON "global_counterparties" ("tax_id");
  END IF;
END $$;

-- 2) Local Counterparty: link to global registry
ALTER TABLE "counterparties"
  ADD COLUMN IF NOT EXISTS "global_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'counterparties_global_id_idx'
  ) THEN
    CREATE INDEX "counterparties_global_id_idx"
      ON "counterparties" ("global_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_schema = 'public'
      AND tc.table_name = 'counterparties'
      AND tc.constraint_name = 'counterparties_global_id_fkey'
  ) THEN
    ALTER TABLE "counterparties"
      ADD CONSTRAINT "counterparties_global_id_fkey"
      FOREIGN KEY ("global_id") REFERENCES "global_counterparties"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) Organizations: extra index to speed holding tree queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'organizations_holding_id_id_idx'
  ) THEN
    CREATE INDEX "organizations_holding_id_id_idx"
      ON "organizations" ("holding_id", "id");
  END IF;
END $$;

