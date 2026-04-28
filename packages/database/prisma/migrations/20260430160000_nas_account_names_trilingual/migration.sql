-- NAS Chart of Accounts Hardening: trilingual account names (AZ/RU/EN), SMALL_BUSINESS template enum.

DO $$
BEGIN
  ALTER TYPE "TemplateGroup" ADD VALUE 'SMALL_BUSINESS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE "accounts" ADD COLUMN "name_az" TEXT;
ALTER TABLE "accounts" ADD COLUMN "name_ru" TEXT;
ALTER TABLE "accounts" ADD COLUMN "name_en" TEXT;

UPDATE "accounts" SET "name_az" = "name", "name_ru" = "name", "name_en" = "name";

ALTER TABLE "accounts" DROP COLUMN "name";

ALTER TABLE "accounts" ALTER COLUMN "name_az" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "name_ru" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "name_en" SET NOT NULL;

ALTER TABLE "chart_of_accounts_entries" ADD COLUMN "name_az" TEXT;
ALTER TABLE "chart_of_accounts_entries" ADD COLUMN "name_ru" TEXT;
ALTER TABLE "chart_of_accounts_entries" ADD COLUMN "name_en" TEXT;

UPDATE "chart_of_accounts_entries" SET "name_az" = "name", "name_ru" = "name", "name_en" = "name";

ALTER TABLE "chart_of_accounts_entries" DROP COLUMN "name";

ALTER TABLE "chart_of_accounts_entries" ALTER COLUMN "name_az" SET NOT NULL;
ALTER TABLE "chart_of_accounts_entries" ALTER COLUMN "name_ru" SET NOT NULL;
ALTER TABLE "chart_of_accounts_entries" ALTER COLUMN "name_en" SET NOT NULL;
