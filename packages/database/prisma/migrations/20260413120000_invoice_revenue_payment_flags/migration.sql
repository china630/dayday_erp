-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN "email" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "revenue_recognized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoices" ADD COLUMN "payment_received" BOOLEAN NOT NULL DEFAULT false;
