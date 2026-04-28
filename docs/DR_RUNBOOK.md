# DR Runbook: PostgreSQL Restore

This runbook describes how to restore DayDay ERP PostgreSQL data from backups produced by `scripts/db-backup.sh`.

## 1) Preconditions

- Access to backup archive: `*.sql.gz`
- PostgreSQL server is reachable
- Credentials for target DB (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`)
- Maintenance window approved (restore is destructive for target DB)

## 2) Identify Restore Point

1. Locate backup folder (default): `backups/db/`
2. Pick archive by timestamp, for example:
   - `dayday-dayday-20260511-020001.sql.gz`
3. Verify file integrity:
   - `gzip -t "<backup-file>.sql.gz"`

## 3) Prepare Target Database

> If restoring into a fresh DB, create it first.  
> If restoring over existing DB, terminate active connections and recreate DB.

Example (psql):

```bash
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${PGDATABASE}' AND pid <> pg_backend_pid();"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS ${PGDATABASE};"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "CREATE DATABASE ${PGDATABASE};"
```

## 4) Restore From Dump

```bash
gunzip -c "<backup-file>.sql.gz" | psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE"
```

## 5) Post-Restore Validation

1. Apply schema migrations (if needed):
   - `npm run db:migrate`
2. Verify core tables have data:
   - `organizations`, `users`, `transactions`, `journal_entries`
3. Run API health check and basic smoke tests:
   - login, open dashboard, run one report
4. Confirm background workers reconnect normally.

## 6) Rollback Plan

- If restore fails: keep service in maintenance mode, pick earlier backup and repeat.
- If app-level checks fail after restore: re-run restore with previous valid snapshot.

## 7) Operational Notes

- Backup retention is controlled by `RETENTION_DAYS` (default 7).
- Keep at least one off-host copy of critical backups.
- Test restore procedure regularly (at least monthly) on staging.

## 8) Automated DR drill (repo scripts)

1. **Validate counts only** (point `DATABASE_URL` at the DB you just restored, e.g. staging):

   ```bash
   npm run platform:dr-validate
   npm run platform:dr-validate -- --baseline=backups/dr-baseline.example.json
   ```

2. **Full drill** (latest `backups/db/*.sql.gz` → throwaway Postgres in Docker → validate → destroy container). Requires Docker, bash (Git Bash/WSL on Windows), and `gzip`:

   ```bash
   bash scripts/dr-drill.sh
   bash scripts/dr-drill.sh --baseline=backups/dr-baseline.example.json
   ```

   Override backup directory: `BACKUP_DIR=/path/to/backups bash scripts/dr-drill.sh`.  
   Override host port: `DR_DRILL_PORT=55433 bash scripts/dr-drill.sh`.

3. Copy **`backups/dr-baseline.example.json`** to a secure path and adjust numbers after a known-good production snapshot if you want strict equality checks.
