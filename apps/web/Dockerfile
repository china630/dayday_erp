# Monorepo-aware production image: @dayday/web (workspace install satisfies lockfile).
# Build from repository root: docker build -f apps/web/Dockerfile .
# NEXT_PUBLIC_API_URL is baked into the client bundle at build time when used in client code.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/

COPY packages/database packages/database
COPY apps/web apps/web

RUN npm ci

# Один слой перед `next build`: все ARG → ENV, чтобы Next/Sentry webpack видели переменные
# в процессе `npm run build -w @dayday/web` (инлайн NEXT_PUBLIC_* в клиентский бандл).
ARG NEXT_PUBLIC_API_URL=http://api:4000
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT_WEB
ARG SENTRY_TUNNEL_PATH
ARG SENTRY_UPLOAD_SOURCEMAPS=0
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT_WEB=${SENTRY_PROJECT_WEB}
ENV SENTRY_TUNNEL_PATH=${SENTRY_TUNNEL_PATH}
ENV SENTRY_UPLOAD_SOURCEMAPS=${SENTRY_UPLOAD_SOURCEMAPS}

RUN set -eux; \
  if [ -n "${NEXT_PUBLIC_SENTRY_DSN:-}" ]; then echo "web build: NEXT_PUBLIC_SENTRY_DSN is set (client Sentry will init)"; else echo "web build: WARNING — NEXT_PUBLIC_SENTRY_DSN empty, client Sentry will not init"; fi; \
  if [ "${SENTRY_UPLOAD_SOURCEMAPS:-0}" = "1" ]; then \
    echo "web build: Sentry source maps upload ENABLED (SENTRY_UPLOAD_SOURCEMAPS=1)"; \
    if [ -n "${SENTRY_AUTH_TOKEN:-}" ] && [ -n "${SENTRY_ORG:-}" ] && [ -n "${SENTRY_PROJECT_WEB:-}" ]; then echo "web build: Sentry source maps upload env present"; else echo "web build: ERROR — Sentry upload enabled but SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT_WEB incomplete"; exit 1; fi; \
  else \
    echo "web build: Sentry source maps upload DISABLED by default (set SENTRY_UPLOAD_SOURCEMAPS=1 to enable)"; \
    unset SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT_WEB || true; \
  fi; \
  npm run build -w @dayday/web

RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app /app

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@dayday/web"]
