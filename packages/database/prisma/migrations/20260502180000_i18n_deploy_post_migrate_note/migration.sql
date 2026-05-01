-- i18n / translation_overrides: this migration does not insert strings.
-- After every `prisma migrate deploy` on production, run from repo root:
--   npm run db:deploy
-- which executes `migrate deploy` + `db:sync-i18n:prune` (upsert all RU/AZ keys from
-- apps/web/lib/i18n/resources.ts into translation_overrides, remove orphaned ru/az keys,
-- bump system_config i18n.cacheVersion).
-- Before release builds, also run `npm run i18n:catalog` so API default catalog JSON matches resources.ts.
SELECT 1;
