#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/dayday_erp"
COMPOSE_FILE="docker-compose.prod.yml"

cd "${ROOT_DIR}"

echo "[deploy-prod] Pull latest changes"
git pull

echo "[deploy-prod] Backup database"
"${ROOT_DIR}/scripts/backup-db.sh"

echo "[deploy-prod] Build and start production stack"
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "[deploy-prod] Apply Prisma migrations"
docker compose -f "${COMPOSE_FILE}" exec -T api \
  sh -lc "cd /app && npm run db:migrate:deploy"

echo "[deploy-prod] Current service status"
docker compose -f "${COMPOSE_FILE}" ps
