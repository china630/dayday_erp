-- DayDay ERP: справочные данные после применения миграций Prisma.
--
-- План счетов: отдельной глобальной таблицы ChartOfAccounts в схеме нет; канон —
-- packages/database/seeds/chart-of-accounts-az.json, загрузка в Account при создании организации
-- (syncAzChartForOrganization).
--
-- TaxConfig: отдельной таблицы нет; VÖEN/НДС — в counterparty / organization, отчёты e-taxes.
--
-- translation_overrides: базовые строки также могут приходить из миграций; полный дамп с локальной БД —
-- npm run docker-init:export -w @dayday/database (из корня с .env).
--
-- Супер-админ платформы: в модели User нет полей role / isVerified / isActive — флаг is_super_admin.
-- password_hash: bcrypt для пароля 12345678 (смените после первого входа).
-- Чтобы подставить хеш из локальной БД: npm run docker-init:super-admin-hash -w @dayday/database
-- и замените значение ниже.

BEGIN;

-- Платформенный супер-админ (JWT isSuperAdmin; /api/admin)
INSERT INTO "users" (
  "id",
  "email",
  "password_hash",
  "first_name",
  "last_name",
  "full_name",
  "avatar_url",
  "is_super_admin",
  "created_at",
  "updated_at"
)
VALUES (
  'c0000001-0000-4000-8000-000000000001'::uuid,
  'shirinov.chingiz@gmail.com',
  '$2b$10$XFrxizlL6EuTP8NZbIGg6ekYdchGXFffxTwRDMl/VdZRR9Md6kESi',
  NULL,
  NULL,
  NULL,
  NULL,
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT ("email") DO UPDATE SET
  "is_super_admin" = TRUE,
  "updated_at" = NOW();

-- Каталог модулей конструктора (как prisma/pricing-module-seed.ts + seed.ts)
INSERT INTO "pricing_modules" ("id", "key", "name", "price_per_month", "sort_order", "created_at", "updated_at")
VALUES
  ('a0000001-0000-4000-8000-000000000001'::uuid, 'kassa_pro', 'Kassa Pro', 15.00, 0, NOW(), NOW()),
  ('a0000002-0000-4000-8000-000000000002'::uuid, 'banking_pro', 'Banking Pro', 19.00, 1, NOW(), NOW()),
  ('a0000003-0000-4000-8000-000000000003'::uuid, 'inventory', 'Warehouse', 25.00, 2, NOW(), NOW()),
  ('a0000004-0000-4000-8000-000000000004'::uuid, 'manufacturing', 'Manufacturing', 39.00, 3, NOW(), NOW()),
  ('a0000005-0000-4000-8000-000000000005'::uuid, 'hr_full', 'HR', 19.00, 4, NOW(), NOW()),
  ('a0000006-0000-4000-8000-000000000006'::uuid, 'ifrs_mapping', 'IFRS', 29.00, 5, NOW(), NOW())
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "price_per_month" = EXCLUDED."price_per_month",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = NOW();

-- Прайс-лист платформы (foundation + модули + квоты), как prisma/seed.ts
INSERT INTO "pricing" ("id", "key", "kind", "name", "amount_azn", "unit_size", "sort_order", "created_at", "updated_at")
VALUES
  ('b0000001-0000-4000-8000-000000000001'::uuid, 'foundation_monthly', 'FOUNDATION'::"PricingKind", 'Foundation (база на организацию)', 29.00, NULL, 0, NOW(), NOW()),
  ('b0000002-0000-4000-8000-000000000002'::uuid, 'kassa_pro', 'MODULE'::"PricingKind", 'Kassa Pro', 15.00, NULL, 1, NOW(), NOW()),
  ('b0000003-0000-4000-8000-000000000003'::uuid, 'banking_pro', 'MODULE'::"PricingKind", 'Banking Pro', 19.00, NULL, 2, NOW(), NOW()),
  ('b0000004-0000-4000-8000-000000000004'::uuid, 'inventory', 'MODULE'::"PricingKind", 'Warehouse', 25.00, NULL, 3, NOW(), NOW()),
  ('b0000005-0000-4000-8000-000000000005'::uuid, 'manufacturing', 'MODULE'::"PricingKind", 'Manufacturing', 39.00, NULL, 4, NOW(), NOW()),
  ('b0000006-0000-4000-8000-000000000006'::uuid, 'hr_full', 'MODULE'::"PricingKind", 'HR', 19.00, NULL, 5, NOW(), NOW()),
  ('b0000007-0000-4000-8000-000000000007'::uuid, 'ifrs_mapping', 'MODULE'::"PricingKind", 'IFRS', 29.00, NULL, 6, NOW(), NOW()),
  ('b0000008-0000-4000-8000-000000000008'::uuid, 'quota_employees_block', 'QUOTA'::"PricingKind", 'Доп. сотрудники (блок)', 15.00, 10, 10, NOW(), NOW()),
  ('b0000009-0000-4000-8000-000000000009'::uuid, 'quota_storage_gb_block', 'QUOTA'::"PricingKind", 'Доп. хранилище (блок)', 5.00, 5, 11, NOW(), NOW()),
  ('b000000a-0000-4000-8000-00000000000a'::uuid, 'quota_invoices_block', 'QUOTA'::"PricingKind", 'Доп. исходящие инвойсы (блок)', 10.00, 500, 12, NOW(), NOW())
ON CONFLICT ("key") DO UPDATE SET
  "kind" = EXCLUDED."kind",
  "name" = EXCLUDED."name",
  "amount_azn" = EXCLUDED."amount_azn",
  "unit_size" = EXCLUDED."unit_size",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = NOW();

-- Системные настройки (дополняют INSERT из миграции super_admin для billing.price.*)
INSERT INTO "system_config" ("id", "key", "value", "updated_at")
VALUES
  (uuid_generate_v4(), 'quota.tier.STARTER', '{"maxOrganizations":1,"maxEmployees":5,"maxInvoicesPerMonth":20}'::jsonb, NOW()),
  (uuid_generate_v4(), 'quota.tier.BUSINESS', '{"maxOrganizations":3,"maxEmployees":50,"maxInvoicesPerMonth":500}'::jsonb, NOW()),
  (uuid_generate_v4(), 'quota.tier.ENTERPRISE', '{"maxOrganizations":null,"maxEmployees":null,"maxInvoicesPerMonth":null}'::jsonb, NOW()),
  (uuid_generate_v4(), 'billing.foundation_monthly_azn', '29'::jsonb, NOW()),
  (uuid_generate_v4(), 'billing.yearly_discount_percent', '20'::jsonb, NOW()),
  (uuid_generate_v4(), 'billing.quota_unit_pricing_v1', '{"employeeBlockSize":10,"pricePerEmployeeBlockAzn":15,"documentPackSize":1000,"pricePerDocumentPackAzn":5}'::jsonb, NOW()),
  (uuid_generate_v4(), 'i18n.cacheVersion', '0'::jsonb, NOW())
ON CONFLICT ("key") DO UPDATE SET
  "value" = EXCLUDED."value",
  "updated_at" = NOW();

COMMIT;
