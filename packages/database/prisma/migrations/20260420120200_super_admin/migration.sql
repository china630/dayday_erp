-- Super-Admin: User flag, subscription block, system_config, translation_overrides

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "organization_subscriptions" ADD COLUMN IF NOT EXISTS "is_blocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "system_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "system_config_key_key" ON "system_config"("key");

CREATE TABLE IF NOT EXISTS "translation_overrides" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "translation_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "translation_overrides_locale_key_key" ON "translation_overrides"("locale", "key");
CREATE INDEX IF NOT EXISTS "translation_overrides_locale_idx" ON "translation_overrides"("locale");

INSERT INTO "system_config" ("id", "key", "value", "updated_at")
SELECT uuid_generate_v4(), 'billing.price.STARTER', '49'::jsonb, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "system_config" WHERE "key" = 'billing.price.STARTER');

INSERT INTO "system_config" ("id", "key", "value", "updated_at")
SELECT uuid_generate_v4(), 'billing.price.BUSINESS', '149'::jsonb, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "system_config" WHERE "key" = 'billing.price.BUSINESS');

INSERT INTO "system_config" ("id", "key", "value", "updated_at")
SELECT uuid_generate_v4(), 'billing.price.ENTERPRISE', '499'::jsonb, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "system_config" WHERE "key" = 'billing.price.ENTERPRISE');
