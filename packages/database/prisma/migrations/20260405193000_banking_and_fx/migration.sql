-- CreateEnum
CREATE TYPE "BankStatementLineType" AS ENUM ('INFLOW', 'OUTFLOW');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'AZN';

-- CreateIndex
CREATE INDEX "accounts_organization_id_currency_idx" ON "accounts"("organization_id", "currency");

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "total_amount" DECIMAL(19,4) NOT NULL,
    "bank_name" TEXT NOT NULL,
    "source_file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "bank_statement_id" UUID NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "type" "BankStatementLineType" NOT NULL,
    "is_matched" BOOLEAN NOT NULL DEFAULT false,
    "counterparty_tax_id" TEXT,
    "value_date" DATE,
    "matched_invoice_id" UUID,
    "raw_row" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statements_organization_id_date_idx" ON "bank_statements"("organization_id", "date");

-- CreateIndex
CREATE INDEX "bank_statements_organization_id_created_at_idx" ON "bank_statements"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organization_id_is_matched_idx" ON "bank_statement_lines"("organization_id", "is_matched");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organization_id_counterparty_tax_id_idx" ON "bank_statement_lines"("organization_id", "counterparty_tax_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organization_id_bank_statement_id_idx" ON "bank_statement_lines"("organization_id", "bank_statement_id");

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_bank_statement_id_fkey" FOREIGN KEY ("bank_statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matched_invoice_id_fkey" FOREIGN KEY ("matched_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
