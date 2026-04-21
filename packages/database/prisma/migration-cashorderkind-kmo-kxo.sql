-- CashOrderKind: MKO/MXO -> KMO/KXO
-- This script renames enum values and updates document numbers to keep sequences consistent.
--
-- Run manually against the target database once (PostgreSQL 10+).

BEGIN;

DO $$
BEGIN
  -- Rename enum labels only if legacy values still exist.
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'MKO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''MKO'' TO ''KMO''';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'MXO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''MXO'' TO ''KXO''';
  END IF;
END $$;

-- Update any leftover textual values in rows (defensive).
UPDATE "cash_orders"
SET "kind" = 'KMO'
WHERE "kind"::text = 'MKO';

UPDATE "cash_orders"
SET "kind" = 'KXO'
WHERE "kind"::text = 'MXO';

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^MKO-', 'KMO-')
WHERE "order_number" LIKE 'MKO-%';

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^MXO-', 'KXO-')
WHERE "order_number" LIKE 'MXO-%';

COMMIT;

