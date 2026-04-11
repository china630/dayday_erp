-- DropIndex
DROP INDEX "invoices_counterparty_id_idx";

-- AlterTable
ALTER TABLE "digital_signature_logs" ALTER COLUMN "status" SET DEFAULT 'PENDING_MOBILE',
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "document_kind" SET DEFAULT 'INVOICE';

-- AlterTable
ALTER TABLE "pricing" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pricing_bundles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pricing_modules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_invoices" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "system_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "translation_overrides" ALTER COLUMN "updated_at" DROP DEFAULT;
