-- Roadmap 95+ (M5): direct banking outbound payment drafts

CREATE TYPE "BankPaymentDraftStatus" AS ENUM ('PENDING', 'SENT', 'REJECTED', 'COMPLETED');

CREATE TABLE "bank_payment_drafts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AZN',
    "recipient_iban" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT,
    "provider_draft_id" TEXT,
    "status" "BankPaymentDraftStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "bank_payment_drafts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bank_payment_drafts"
ADD CONSTRAINT "bank_payment_drafts_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "bank_payment_drafts_org_status_idx"
ON "bank_payment_drafts"("organization_id", "status");

CREATE INDEX "bank_payment_drafts_org_created_idx"
ON "bank_payment_drafts"("organization_id", "created_at");
