#!/usr/bin/env bash
# Production: code + apply DB migrations (Prisma migrate deploy).
# Keeps Postgres volume; safe when only new/changed migrations ship.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="${ROOT_DIR:-${REPO_ROOT}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "[deploy-prod-db-migrate] ERROR: missing .env in ${ROOT_DIR}. Copy: cp env.production.example .env" >&2
  exit 1
fi
if ! grep -qE '^[[:space:]]*REDIS_URL=[^[:space:]]+' .env; then
  echo "[deploy-prod-db-migrate] ERROR: set REDIS_URL in .env (e.g. redis://redis:6379)." >&2
  exit 1
fi

echo "[deploy-prod-db-migrate] Pull latest changes"
git pull

echo "[deploy-prod-db-migrate] Backup database"
bash "${ROOT_DIR}/scripts/backup-db.sh"

echo "[deploy-prod-db-migrate] Build and start stack"
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "[deploy-prod-db-migrate] Apply Prisma migrations"
docker compose -f "${COMPOSE_FILE}" exec -T api \
  sh -lc "cd /app && npm run db:migrate:deploy"

echo "[deploy-prod-db-migrate] Prod-init schema fixups (idempotent DDL)"
docker compose -f "${COMPOSE_FILE}" exec -T api \
  sh -lc "cd /app && npm run db:prod-init -w @dayday/database"

echo "[deploy-prod-db-migrate] Service status"
docker compose -f "${COMPOSE_FILE}" ps
