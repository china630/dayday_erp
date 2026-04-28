-- NAS global template accounts + org profile + optional link from local Account

CREATE TYPE "CoaTemplateProfile" AS ENUM ('COMMERCIAL_FULL', 'COMMERCIAL_SMALL');

ALTER TABLE "organizations" ADD COLUMN "coa_template_profile" "CoaTemplateProfile" NOT NULL DEFAULT 'COMMERCIAL_FULL';

CREATE TABLE "template_accounts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT NOT NULL,
    "name_az" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "parent_code" TEXT,
    "cash_profile" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "template_groups" "CoaTemplateProfile"[] NOT NULL DEFAULT ARRAY[]::"CoaTemplateProfile"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "template_accounts_code_key" ON "template_accounts"("code");
CREATE INDEX "template_accounts_code_idx" ON "template_accounts"("code");

ALTER TABLE "accounts" ADD COLUMN "template_account_id" UUID;

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_template_account_id_fkey" FOREIGN KEY ("template_account_id") REFERENCES "template_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "accounts_template_account_id_idx" ON "accounts"("template_account_id");

CREATE INDEX "organizations_coa_template_profile_idx" ON "organizations"("coa_template_profile");
