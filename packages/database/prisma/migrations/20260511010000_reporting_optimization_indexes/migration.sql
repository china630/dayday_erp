CREATE INDEX "transactions_org_status_period_idx"
ON "transactions"("organization_id", "is_final", "date");

CREATE INDEX "journal_entries_account_id_idx"
ON "journal_entries"("account_id");

CREATE INDEX "journal_entries_org_period_status_ledger_idx"
ON "journal_entries"("organization_id", "ledger_type", "transaction_id");
