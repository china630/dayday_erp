-- i18n overrides: header strip quota labels (AZ / RU), merged on client with resources.ts
INSERT INTO "translation_overrides" ("id", "locale", "key", "value", "updated_at")
VALUES
  (uuid_generate_v4(), 'az', 'headerStrip.invoices', 'Hesab-fakturalar (ay)', NOW()),
  (uuid_generate_v4(), 'az', 'headerStrip.employees', 'İşçilər', NOW()),
  (uuid_generate_v4(), 'ru', 'headerStrip.invoices', 'Инвойсы (мес.)', NOW()),
  (uuid_generate_v4(), 'ru', 'headerStrip.employees', 'Сотрудники', NOW())
ON CONFLICT ("locale", "key") DO UPDATE SET
  "value" = EXCLUDED."value",
  "updated_at" = NOW();
