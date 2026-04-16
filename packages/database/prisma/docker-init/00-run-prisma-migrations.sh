#!/bin/sh
# Применяет SQL-миграции Prisma (файл migration.sql в каждом каталоге) в сортировке по пути.
# Том: ./packages/database/prisma/migrations -> /dayday-prisma-migrations (docker-compose.prod.yml).
set -eu
if [ ! -d /dayday-prisma-migrations ]; then
  echo "dayday: /dayday-prisma-migrations не смонтирован — пропуск миграций при init."
  exit 0
fi

# Hotfix: allow fresh init even if some historical migrations ALTER enums
# that may not exist yet in this custom init flow.
psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  -c "DO \$\$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BankStatementLineOrigin') THEN
          CREATE TYPE \"BankStatementLineOrigin\" AS ENUM (
            'FILE_IMPORT',
            'DIRECT_SYNC',
            'WEBHOOK',
            'INVOICE_PAYMENT_SYSTEM',
            'MANUAL_CASH_OUT',
            'MANUAL_BANK_ENTRY'
          );
        END IF;
      END \$\$;"
find /dayday-prisma-migrations -mindepth 2 -maxdepth 2 -name migration.sql -print \
  | LC_ALL=C sort \
  | while IFS= read -r f; do
    echo "dayday: applying $f"
    psql -v ON_ERROR_STOP=1 \
      --username "${POSTGRES_USER}" \
      --dbname "${POSTGRES_DB}" \
      -f "$f"
  done
