#!/usr/bin/env bash
# Production: code + apply DB migrations (Prisma migrate deploy).
# Keeps Postgres volume; safe when only new/changed migrations ship.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="${ROOT_DIR:-${REPO_ROOT}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "${ROOT_DIR}"

echo "[deploy-prod-db-migrate] Pull latest changes"
git pull

echo "[deploy-prod-db-migrate] Backup database"
"${ROOT_DIR}/scripts/backup-db.sh"

echo "[deploy-prod-db-migrate] Build and start stack"
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "[deploy-prod-db-migrate] Apply Prisma migrations"
docker compose -f "${COMPOSE_FILE}" exec -T api \
  sh -lc "cd /app && npm run db:migrate:deploy"

echo "[deploy-prod-db-migrate] Service status"
docker compose -f "${COMPOSE_FILE}" ps
