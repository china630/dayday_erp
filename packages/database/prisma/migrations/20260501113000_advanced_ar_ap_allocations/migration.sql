-- Advanced AR/AP v2: payment allocations + cached paid amount

ALTER TABLE "invoices"
ADD COLUMN "paid_amount" DECIMAL(19,4) NOT NULL DEFAULT 0;

CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "allocated_amount" DECIMAL(19,4) NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_allocations"
ADD CONSTRAINT "payment_allocations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_allocations"
ADD CONSTRAINT "payment_allocations_transaction_id_fkey"
FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_allocations"
ADD CONSTRAINT "payment_allocations_invoice_id_fkey"
FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "payment_alloc_org_invoice_idx"
ON "payment_allocations"("organization_id", "invoice_id");

CREATE INDEX "payment_alloc_org_tx_idx"
ON "payment_allocations"("organization_id", "transaction_id");

CREATE INDEX "payment_alloc_org_date_idx"
ON "payment_allocations"("organization_id", "date");

-- Backfill from legacy invoice_payments
INSERT INTO "payment_allocations" (
    "organization_id",
    "transaction_id",
    "invoice_id",
    "allocated_amount",
    "date"
)
SELECT
    ip."organization_id",
    ip."transaction_id",
    ip."invoice_id",
    ip."amount",
    ip."date"
FROM "invoice_payments" ip
WHERE ip."transaction_id" IS NOT NULL;

UPDATE "invoices" i
SET "paid_amount" = COALESCE(agg.paid, 0)
FROM (
    SELECT "invoice_id", SUM("amount")::DECIMAL(19,4) AS paid
    FROM "invoice_payments"
    GROUP BY "invoice_id"
) agg
WHERE i."id" = agg."invoice_id";
