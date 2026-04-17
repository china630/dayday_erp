#!/usr/bin/env bash
# Production: code + DB from scratch (drop volumes, full db:prod-init).
# WARNING: destroys Postgres data in the compose volume (pgdata).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="${ROOT_DIR:-${REPO_ROOT}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "[deploy-prod-db-reset] ERROR: missing .env in ${ROOT_DIR}. Copy: cp env.production.example .env" >&2
  exit 1
fi
if ! grep -qE '^[[:space:]]*REDIS_URL=[^[:space:]]+' .env; then
  echo "[deploy-prod-db-reset] ERROR: set REDIS_URL in .env (e.g. redis://redis:6379)." >&2
  exit 1
fi

echo "[deploy-prod-db-reset] Pull latest changes"
git pull

echo "[deploy-prod-db-reset] Backup database before wipe"
if ! bash "${ROOT_DIR}/scripts/backup-db.sh"; then
  echo "[deploy-prod-db-reset] WARNING: backup failed, continuing with reset"
fi

echo "[deploy-prod-db-reset] Stop stack and remove volumes"
docker compose -f "${COMPOSE_FILE}" down -v

echo "[deploy-prod-db-reset] Start database and redis"
docker compose -f "${COMPOSE_FILE}" up -d db redis

echo "[deploy-prod-db-reset] Build and start full stack"
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "[deploy-prod-db-reset] Full DB init (migrate + seed + i18n + prod-init)"
docker compose -f "${COMPOSE_FILE}" exec -T api \
  sh -lc "cd /app && npm run db:prod-init"

echo "[deploy-prod-db-reset] Service status"
docker compose -f "${COMPOSE_FILE}" ps
