#!/bin/sh
# Применяет SQL-миграции Prisma (файл migration.sql в каждом каталоге) в сортировке по пути.
# Том: ./packages/database/prisma/migrations -> /dayday-prisma-migrations (docker-compose.prod.yml).
set -eu
if [ ! -d /dayday-prisma-migrations ]; then
  echo "dayday: /dayday-prisma-migrations не смонтирован — пропуск миграций при init."
  exit 0
fi
find /dayday-prisma-migrations -mindepth 2 -maxdepth 2 -name migration.sql -print \
  | LC_ALL=C sort \
  | while IFS= read -r f; do
    echo "dayday: applying $f"
    psql -v ON_ERROR_STOP=1 \
      --username "${POSTGRES_USER}" \
      --dbname "${POSTGRES_DB}" \
      -f "$f"
  done
