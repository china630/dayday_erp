-- CreateEnum
CREATE TYPE "SignedDocumentKind" AS ENUM ('INVOICE', 'RECONCILIATION_ACT');

-- AlterTable
ALTER TABLE "digital_signature_logs" ADD COLUMN "document_kind" "SignedDocumentKind" NOT NULL DEFAULT 'INVOICE';
ALTER TABLE "digital_signature_logs" ADD COLUMN "content_hash_sha256" VARCHAR(64);

ALTER TABLE "digital_signature_logs" ALTER COLUMN "document_kind" DROP DEFAULT;
