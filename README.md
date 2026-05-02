# DayDay ERP

Monorepo: `apps/web`, `apps/api`, `packages/database`. See `.cursor/rules` and `PRD.md` / `TZ.md` for product and technical specs.

## Production deploy

1. Copy **`env.production.example`** → `.env` in the repo root and fill secrets (`POSTGRES_PASSWORD`, `JWT_*`, `REDIS_URL`, `CORS_ORIGINS`, …).
2. Follow **[docs/deploy.ru.md](./docs/deploy.ru.md)** (or [docs/deploy.md](./docs/deploy.md) in English).
3. Use **`bash scripts/deploy-prod-db-migrate.sh`** when the release includes Prisma migrations; use **`bash scripts/deploy-prod-code.sh`** when only code/images change.

## Testing

- **i18n (RU + AZ):** `npm run i18n:audit` — scans `apps/web/app`, `apps/web/components`, and `apps/web/lib` for `t('…')` / `Trans` keys and fails if any key is missing or empty in `apps/web/lib/i18n/resources.ts` (TZ §17). After editing `resources.ts`, run **`npm run i18n:catalog`** from the repo root to regenerate `apps/api/src/admin/i18n-default-catalog-data.json` for the API / Super-Admin translation defaults, and commit the JSON if it changed (PRD §7.6.1).
- **Production DB after migrations:** `npm run db:deploy` — `prisma migrate deploy` plus **`translation_overrides`** sync (and prune stale ru/az keys) from `resources.ts`, then clients pick up new strings via `i18n.cacheVersion` (TZ §17).
