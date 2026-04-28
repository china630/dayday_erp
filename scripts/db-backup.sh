#!/usr/bin/env bash
set -euo pipefail

# Daily PostgreSQL backup with rotation (7 days) and gzip compression.
# Requires: pg_dump, gzip, find

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups/db}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"

DB_HOST="${PGHOST:-${POSTGRES_HOST:-127.0.0.1}}"
DB_PORT="${PGPORT:-${POSTGRES_PORT:-5432}}"
DB_NAME="${PGDATABASE:-${POSTGRES_DB:-dayday}}"
DB_USER="${PGUSER:-${POSTGRES_USER:-dayday}}"

# Either export PGPASSWORD, or rely on ~/.pgpass.
: "${PGPASSWORD:=}"
export PGPASSWORD

mkdir -p "${BACKUP_DIR}"

RAW_FILE="${BACKUP_DIR}/dayday-${DB_NAME}-${TIMESTAMP}.sql"
ARCHIVE_FILE="${RAW_FILE}.gz"

echo "[db-backup] Dumping database ${DB_NAME} from ${DB_HOST}:${DB_PORT}"
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  "${DB_NAME}" > "${RAW_FILE}"

gzip -9 "${RAW_FILE}"
echo "[db-backup] Created ${ARCHIVE_FILE}"

echo "[db-backup] Rotating backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +"${RETENTION_DAYS}" -print -delete

echo "[db-backup] Completed"
