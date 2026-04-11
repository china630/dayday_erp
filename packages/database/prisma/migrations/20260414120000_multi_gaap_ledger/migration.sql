-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('NAS', 'IFRS');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "ledger_type" "LedgerType" NOT NULL DEFAULT 'NAS';

-- DropIndex
DROP INDEX "accounts_organization_id_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "accounts_organization_id_code_ledger_type_key" ON "accounts"("organization_id", "code", "ledger_type");

CREATE INDEX "accounts_organization_id_ledger_type_idx" ON "accounts"("organization_id", "ledger_type");

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN "ledger_type" "LedgerType" NOT NULL DEFAULT 'NAS';

CREATE INDEX "journal_entries_organization_id_ledger_type_idx" ON "journal_entries"("organization_id", "ledger_type");

-- CreateTable
CREATE TABLE "account_mappings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "nas_account_id" UUID NOT NULL,
    "ifrs_account_id" UUID NOT NULL,
    "ratio" DECIMAL(19,8) NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_mappings_organization_id_nas_account_id_key" ON "account_mappings"("organization_id", "nas_account_id");

CREATE INDEX "account_mappings_organization_id_idx" ON "account_mappings"("organization_id");

ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_nas_account_id_fkey" FOREIGN KEY ("nas_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "account_mappings" ADD CONSTRAINT "account_mappings_ifrs_account_id_fkey" FOREIGN KEY ("ifrs_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
