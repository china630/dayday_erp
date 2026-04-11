-- Billing v10.2: Organization.ownerId + activeModules, Pricing, SubscriptionInvoice

-- CreateEnum
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PricingKind" AS ENUM ('FOUNDATION', 'MODULE', 'QUOTA');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "owner_id" UUID,
ADD COLUMN "active_modules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill owner_id: первый пользователь с ролью OWNER в организации
UPDATE "organizations" o
SET "owner_id" = sub.uid
FROM (
  SELECT DISTINCT ON ("organization_id") "organization_id", "user_id" AS uid
  FROM "organization_memberships"
  WHERE "role" = 'OWNER'
  ORDER BY "organization_id", "joined_at" ASC
) sub
WHERE o."id" = sub."organization_id" AND o."owner_id" IS NULL;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "organizations_owner_id_idx" ON "organizations"("owner_id");

-- CreateTable
CREATE TABLE "pricing" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "kind" "PricingKind" NOT NULL,
    "name" TEXT NOT NULL,
    "amount_azn" DECIMAL(12,2) NOT NULL,
    "unit_size" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_key_key" ON "pricing"("key");

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "SubscriptionInvoiceStatus" NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "subscription_invoices_user_id_idx" ON "subscription_invoices"("user_id");

CREATE INDEX "subscription_invoices_user_id_date_idx" ON "subscription_invoices"("user_id", "date");
