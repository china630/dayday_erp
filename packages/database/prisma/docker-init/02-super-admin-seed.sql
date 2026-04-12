-- Платформенный супер-админ (JWT isSuperAdmin; /api/admin).
-- Этот файл НЕ перезаписывается `npm run db:dump-to-prod` / docker-init:export.
-- Bcrypt ниже — пароль 12345678; после первого входа смените. Обновить только хеш в репозитории:
--   npm run docker-init:super-admin-hash -w @dayday/database
--
-- При повторном накате на существующего пользователя пароль НЕ меняем (только флаг super-admin).

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
