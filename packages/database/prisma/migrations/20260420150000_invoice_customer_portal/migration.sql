-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN "portal_locale" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "public_token" VARCHAR(200);

CREATE UNIQUE INDEX "invoices_public_token_key" ON "invoices"("public_token");
