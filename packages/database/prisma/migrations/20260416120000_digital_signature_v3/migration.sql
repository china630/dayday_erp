-- CreateEnum
CREATE TYPE "SignatureProvider" AS ENUM ('ASAN_IMZA', 'SIMA');

-- CreateEnum
CREATE TYPE "DigitalSignatureStatus" AS ENUM ('PENDING_MOBILE', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'LOCKED_BY_SIGNATURE';

-- AlterTable (defaults — для существующих строк; затем DEFAULT снимаем)
ALTER TABLE "digital_signature_logs" ADD COLUMN "provider" "SignatureProvider" NOT NULL DEFAULT 'ASAN_IMZA';
ALTER TABLE "digital_signature_logs" ADD COLUMN "status" "DigitalSignatureStatus" NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "digital_signature_logs" ADD COLUMN "certificate_subject" TEXT;
ALTER TABLE "digital_signature_logs" ADD COLUMN "certificate_issuer" TEXT;
ALTER TABLE "digital_signature_logs" ADD COLUMN "pending_started_at" TIMESTAMP(3);
ALTER TABLE "digital_signature_logs" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "digital_signature_logs" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "digital_signature_logs" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "digital_signature_logs" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "digital_signature_logs" ALTER COLUMN "signed_at" DROP NOT NULL;
ALTER TABLE "digital_signature_logs" ALTER COLUMN "signed_at" DROP DEFAULT;

CREATE INDEX "digital_signature_logs_organization_id_status_idx" ON "digital_signature_logs"("organization_id", "status");
