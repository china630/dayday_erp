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

ARG NEXT_PUBLIC_API_URL=http://api:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm ci

# Sentry / Next: переменные должны быть в ENV на момент `next build` (клиентский DSN, upload source maps).
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ARG SENTRY_AUTH_TOKEN=
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ARG SENTRY_ORG=
ENV SENTRY_ORG=${SENTRY_ORG}
ARG SENTRY_PROJECT_WEB=
ENV SENTRY_PROJECT_WEB=${SENTRY_PROJECT_WEB}

RUN npm run build -w @dayday/web

RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app /app

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@dayday/web"]
