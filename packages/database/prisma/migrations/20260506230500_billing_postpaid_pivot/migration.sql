-- Billing pivot: post-paid lifecycle and monthly billing period marker

CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'SOFT_BLOCK', 'HARD_BLOCK');

ALTER TABLE "organizations"
ADD COLUMN "billing_status" "BillingStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "subscription_invoices"
ADD COLUMN "billing_period" TEXT;

CREATE INDEX "subscription_invoices_user_id_billing_period_idx"
ON "subscription_invoices"("user_id", "billing_period");
