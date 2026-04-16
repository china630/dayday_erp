#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/opt/dayday_erp"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="${ROOT_DIR}/backups"
TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.sql"

cd "${ROOT_DIR}"
mkdir -p "${BACKUP_DIR}"

echo "[backup-db] Creating backup: ${BACKUP_FILE}"

docker compose -f "${COMPOSE_FILE}" exec -T db \
  pg_dump -U "${POSTGRES_USER:-dayday}" "${POSTGRES_DB:-dayday}" > "${BACKUP_FILE}"

echo "[backup-db] Backup completed"
