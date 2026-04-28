-- CreateTable
CREATE TABLE "account_balances" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "ledger_type" "LedgerType" NOT NULL DEFAULT 'NAS',
    "balance_date" DATE NOT NULL,
    "debit_balance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "credit_balance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "account_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ifrs_mapping_rules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "source_nas_account_code" TEXT NOT NULL,
    "target_ifrs_account_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ifrs_mapping_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_balances_organization_id_account_id_ledger_type_bala_key"
ON "account_balances"("organization_id", "account_id", "ledger_type", "balance_date");

-- CreateIndex
CREATE INDEX "account_balances_organization_id_ledger_type_balance_date_idx"
ON "account_balances"("organization_id", "ledger_type", "balance_date");

-- CreateIndex
CREATE UNIQUE INDEX "ifrs_mapping_rules_organization_id_source_nas_account_code_ta_key"
ON "ifrs_mapping_rules"("organization_id", "source_nas_account_code", "target_ifrs_account_code");

-- CreateIndex
CREATE INDEX "ifrs_mapping_rules_organization_id_source_nas_account_code_is__idx"
ON "ifrs_mapping_rules"("organization_id", "source_nas_account_code", "is_active");

-- AddForeignKey
ALTER TABLE "account_balances"
ADD CONSTRAINT "account_balances_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_balances"
ADD CONSTRAINT "account_balances_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ifrs_mapping_rules"
ADD CONSTRAINT "ifrs_mapping_rules_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
