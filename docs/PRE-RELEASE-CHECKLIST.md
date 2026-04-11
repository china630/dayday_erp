# Pre-Release Checklist

Single source of truth for all pre-release tasks in DayDay ERP.

Rule: from now on, all pre-release items are recorded only in this file.

## Current pending items (before Deploy)

- [ ] Upgrade runtime from Node.js 20.x to Node.js 22.x (or current LTS agreed by team).
- [ ] Migrate Prisma from 6.19.3 to Prisma 7.x.
- [ ] Replace deprecated `package.json#prisma` config with `prisma.config.ts`.
- [ ] Adapt Prisma datasource/client configuration to Prisma 7 requirements.
- [ ] Run full verification after migration:
  - [ ] `npm run db:generate`
  - [ ] `npm run build -w @dayday/database -w @dayday/api`
  - [ ] `npm run dev` smoke test (API + Web)
  - [ ] Basic auth flow check (login/registration against running API)
