-- CreateEnum
CREATE TYPE "InventoryValuationMethod" AS ENUM ('AVCO', 'FIFO');

-- CreateEnum
CREATE TYPE "OrgBankAccountCurrency" AS ENUM ('AZN', 'USD', 'EUR');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "legal_address" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "director_name" TEXT,
ADD COLUMN "logo_url" TEXT,
ADD COLUMN "valuation_method" "InventoryValuationMethod" NOT NULL DEFAULT 'AVCO';

-- CreateTable
CREATE TABLE "organization_bank_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "currency" "OrgBankAccountCurrency" NOT NULL,
    "iban" TEXT,
    "swift" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_company_directory" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tax_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_address" TEXT,
    "phone" TEXT,
    "director_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_company_directory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "global_company_directory_tax_id_key" ON "global_company_directory"("tax_id");

-- CreateIndex
CREATE INDEX "organization_bank_accounts_organization_id_idx" ON "organization_bank_accounts"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_bank_accounts" ADD CONSTRAINT "organization_bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
