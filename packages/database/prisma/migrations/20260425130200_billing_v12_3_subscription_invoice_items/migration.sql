-- Billing v12.3 (TZ §14.8): SubscriptionInvoice расширение + billing_invoice_items + FK payment_order

ALTER TABLE "subscription_invoices"
  ADD COLUMN "period_start" TIMESTAMPTZ(6),
  ADD COLUMN "period_end" TIMESTAMPTZ(6),
  ADD COLUMN "pdf_link" TEXT,
  ADD COLUMN "payment_order_id" UUID;

CREATE UNIQUE INDEX "subscription_invoices_payment_order_id_key"
  ON "subscription_invoices"("payment_order_id");

ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_payment_order_id_fkey"
  FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "billing_invoice_items" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "subscription_invoice_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,

  CONSTRAINT "billing_invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_invoice_items_subscription_invoice_id_idx"
  ON "billing_invoice_items"("subscription_invoice_id");

CREATE INDEX "billing_invoice_items_organization_id_idx"
  ON "billing_invoice_items"("organization_id");

ALTER TABLE "billing_invoice_items"
  ADD CONSTRAINT "billing_invoice_items_subscription_invoice_id_fkey"
  FOREIGN KEY ("subscription_invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_invoice_items"
  ADD CONSTRAINT "billing_invoice_items_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
