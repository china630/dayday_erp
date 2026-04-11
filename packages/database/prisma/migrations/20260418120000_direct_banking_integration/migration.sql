-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "bank_webhook_secret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_bank_webhook_secret_key" ON "organizations"("bank_webhook_secret");

-- AlterTable
ALTER TABLE "bank_statement_lines" ADD COLUMN "integration_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_organization_id_integration_key_key" ON "bank_statement_lines"("organization_id", "integration_key");
