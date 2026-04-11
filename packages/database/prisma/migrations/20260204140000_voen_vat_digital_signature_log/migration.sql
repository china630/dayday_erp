-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN "is_vat_payer" BOOLEAN;

-- CreateTable
CREATE TABLE "digital_signature_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "certificate_thumbprint" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_signature_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "digital_signature_logs_organization_id_signed_at_idx" ON "digital_signature_logs"("organization_id", "signed_at");

-- CreateIndex
CREATE INDEX "digital_signature_logs_organization_id_document_id_idx" ON "digital_signature_logs"("organization_id", "document_id");

-- AddForeignKey
ALTER TABLE "digital_signature_logs" ADD CONSTRAINT "digital_signature_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
