-- CreateEnum
CREATE TYPE "CounterpartyLegalForm" AS ENUM (
  'INDIVIDUAL',
  'LLC',
  'CJSC',
  'OJSC',
  'PUBLIC_LEGAL_ENTITY',
  'STATE_AGENCY',
  'NGO',
  'BRANCH',
  'HOA'
);

-- AlterTable
ALTER TABLE "counterparties" ADD COLUMN "legal_form" "CounterpartyLegalForm" NOT NULL DEFAULT 'LLC';

UPDATE "counterparties" SET "is_vat_payer" = false WHERE "is_vat_payer" IS NULL;

ALTER TABLE "counterparties" ALTER COLUMN "is_vat_payer" SET DEFAULT false;
ALTER TABLE "counterparties" ALTER COLUMN "is_vat_payer" SET NOT NULL;
