ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_locked" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "transactions_organization_id_date_is_locked_idx" ON "transactions"("organization_id", "date", "is_locked");
