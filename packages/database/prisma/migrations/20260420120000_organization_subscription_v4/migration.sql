-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('STARTER', 'BUSINESS', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "expires_at" TIMESTAMP(3),
    "active_modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_trial" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_subscriptions_organization_id_key" ON "organization_subscriptions"("organization_id");

ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SaaS v4.0: все существующие организации получают тариф STARTER
INSERT INTO "organization_subscriptions" ("id", "organization_id", "tier", "expires_at", "active_modules", "is_trial", "created_at", "updated_at")
SELECT uuid_generate_v4(), o."id", 'STARTER'::"SubscriptionTier", NULL, ARRAY[]::TEXT[], false, NOW(), NOW()
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "organization_subscriptions" s WHERE s."organization_id" = o."id"
);
