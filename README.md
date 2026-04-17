# DayDay ERP

Monorepo: `apps/web`, `apps/api`, `packages/database`. See `.cursor/rules` and `PRD.md` / `TZ.md` for product and technical specs.

## Production deploy

1. Copy **`env.production.example`** → `.env` in the repo root and fill secrets (`POSTGRES_PASSWORD`, `JWT_*`, `REDIS_URL`, `CORS_ORIGINS`, …).
2. Follow **[docs/deploy.ru.md](./docs/deploy.ru.md)** (or [docs/deploy.md](./docs/deploy.md) in English).
3. Use **`bash scripts/deploy-prod-db-migrate.sh`** when the release includes Prisma migrations; use **`bash scripts/deploy-prod-code.sh`** when only code/images change.

## Testing

- **i18n (RU + AZ):** `npm run i18n:audit` — scans `apps/web/app` for `t('…')` / `i18nKey` usage and fails the process if any key is missing or empty in `resources.ts` for Russian or Azerbaijani (TZ §17).
