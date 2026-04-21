# Monorepo-aware production image: @dayday/database + @dayday/api.
# Build from repository root: docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/

COPY packages/database packages/database
COPY apps/api apps/api
# Used by `npm run db:sync-i18n` / `db:prod-init` (packages/database → apps/web path).
COPY apps/web/lib/i18n/resources.ts apps/web/lib/i18n/resources.ts

RUN npm ci

RUN npm run build -w @dayday/database && npm run build -w @dayday/api

RUN npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app /app

USER nestjs

EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
