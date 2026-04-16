#!/usr/bin/env bash
# Production: code/images only — no DB backup, no Prisma.
# Use when schema and migrations did not change (Dockerfile, API, Web, env-only).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="${ROOT_DIR:-${REPO_ROOT}}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "${ROOT_DIR}"

echo "[deploy-prod-code] Pull latest changes"
git pull

echo "[deploy-prod-code] Build and start stack"
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "[deploy-prod-code] Service status"
docker compose -f "${COMPOSE_FILE}" ps
