-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PARTIALLY_PAID';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "recognized_at" TIMESTAMP(3);

CREATE INDEX "invoices_organization_id_counterparty_id_idx" ON "invoices"("organization_id", "counterparty_id");

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "date" DATE NOT NULL,
    "transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_payments_organization_id_invoice_id_idx" ON "invoice_payments"("organization_id", "invoice_id");

CREATE INDEX "invoice_payments_organization_id_date_idx" ON "invoice_payments"("organization_id", "date");

ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Дата признания выручки для уже проведённых инвойсов
UPDATE "invoices"
SET "recognized_at" = "updated_at"
WHERE "revenue_recognized" = true AND "recognized_at" IS NULL;

-- Синтетические платежи для уже полностью оплаченных инвойсов (идемпотентно)
INSERT INTO "invoice_payments" ("id", "organization_id", "invoice_id", "amount", "date", "transaction_id", "created_at")
SELECT uuid_generate_v4(), i."organization_id", i."id", i."total_amount", (i."updated_at" AT TIME ZONE 'UTC')::date, NULL, i."updated_at"
FROM "invoices" i
WHERE i."payment_received" = true
  AND i."status" = 'PAID'
  AND NOT EXISTS (SELECT 1 FROM "invoice_payments" p WHERE p."invoice_id" = i."id");
