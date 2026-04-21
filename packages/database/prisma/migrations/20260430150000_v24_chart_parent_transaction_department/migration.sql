-- v24.0: NAS template hierarchy in catalog; ЦФО (department) on transactions for expense analytics

ALTER TABLE "chart_of_accounts_entries"
ADD COLUMN IF NOT EXISTS "parent_code" TEXT;

ALTER TABLE "transactions"
ADD COLUMN IF NOT EXISTS "department_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_department_id_fkey'
  ) THEN
    ALTER TABLE "transactions"
    ADD CONSTRAINT "transactions_department_id_fkey"
    FOREIGN KEY ("department_id") REFERENCES "departments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "transactions_department_id_idx" ON "transactions"("department_id");
