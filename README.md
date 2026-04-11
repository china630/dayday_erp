# DayDay ERP

Monorepo: `apps/web`, `apps/api`, `packages/database`. See `.cursor/rules` and `PRD.md` / `TZ.md` for product and technical specs.

## Testing

- **i18n (RU + AZ):** `npm run i18n:audit` — scans `apps/web/app` for `t('…')` / `i18nKey` usage and fails the process if any key is missing or empty in `resources.ts` for Russian or Azerbaijani (TZ §17).
