#!/usr/bin/env bash
# Automated DR drill: restore latest gzip SQL backup into a throwaway Postgres container,
# run table-count validation, then destroy the container.
#
# Requires: docker, gzip; optional pg_dump backup in backups/db/*.sql.gz
#
# Usage (from repo root, bash/Git Bash/WSL):
#   bash scripts/dr-drill.sh
#   BACKUP_DIR=/path/to/backups bash scripts/dr-drill.sh
#   bash scripts/dr-drill.sh --baseline=backups/dr-baseline.example.json
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups/db}"
HOST_PORT="${DR_DRILL_PORT:-55432}"
CONTAINER="dayday-dr-drill-$$"

BASELINE_ARGS=()
for a in "$@"; do
  BASELINE_ARGS+=("$a")
done

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "[dr-drill] No backup dir: ${BACKUP_DIR}" >&2
  exit 1
fi

LATEST="$(ls -t "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | head -1 || true)"
if [[ -z "${LATEST}" ]]; then
  echo "[dr-drill] No *.sql.gz under ${BACKUP_DIR}" >&2
  exit 1
fi

echo "[dr-drill] Using backup: ${LATEST}"

cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "${CONTAINER}" \
  -e POSTGRES_USER=drill \
  -e POSTGRES_PASSWORD=drillpass \
  -e POSTGRES_DB=dayday_drill \
  -p "${HOST_PORT}:5432" \
  postgres:16-alpine >/dev/null

echo "[dr-drill] Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker exec "${CONTAINER}" pg_isready -U drill -d dayday_drill >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[dr-drill] Restoring dump..."
gunzip -c "${LATEST}" | docker exec -i "${CONTAINER}" psql -U drill -d dayday_drill -v ON_ERROR_STOP=1 >/dev/null

export DATABASE_URL="postgresql://drill:drillpass@127.0.0.1:${HOST_PORT}/dayday_drill"
cd "${REPO_ROOT}"
echo "[dr-drill] Validating counts (DATABASE_URL -> drill container)..."
npx tsx scripts/dr-drill-validate.ts "${BASELINE_ARGS[@]}"

echo "[dr-drill] Done."
