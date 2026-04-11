-- v8.1: конструктор тарифа — JSON custom_config.modules для гейтинга
ALTER TABLE "organization_subscriptions" ADD COLUMN IF NOT EXISTS "custom_config" JSONB;
