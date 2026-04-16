#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/dayday_erp"
COMPOSE_FILE="docker-compose.prod.yml"

cd "${ROOT_DIR}"

echo "[reset-and-deploy-prod] Pull latest changes"
git pull

echo "[reset-and-deploy-prod] Backup database before wipe"
if ! "${ROOT_DIR}/scripts/backup-db.sh"; then
  echo "[reset-and-deploy-prod] WARNING: backup failed, continuing with reset"
fi

echo "[reset-and-deploy-prod] Stop stack and remove volumes"
docker compose -f "${COMPOSE_FILE}" down -v

echo "[reset-and-deploy-prod] Start database and redis"
docker compose -f "${COMPOSE_FILE}" up -d db redis

echo "[reset-and-deploy-prod] Build and start full production stack"
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "[reset-and-deploy-prod] Run full production initialization"
docker compose -f "${COMPOSE_FILE}" exec -T api \
  sh -lc "cd /opt/dayday_erp && npm run db:prod-init"

echo "[reset-and-deploy-prod] Current service status"
docker compose -f "${COMPOSE_FILE}" ps
