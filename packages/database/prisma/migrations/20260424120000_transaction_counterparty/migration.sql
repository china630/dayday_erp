ALTER TABLE "transactions" ADD COLUMN "counterparty_id" UUID;
CREATE INDEX "transactions_counterparty_id_idx" ON "transactions"("counterparty_id");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
