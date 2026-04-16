-- CashOrderKind: PKO/RKO -> MKO/MXO
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
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'PKO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''PKO'' TO ''MKO''';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'RKO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''RKO'' TO ''MXO''';
  END IF;
END $$;

-- Update any leftover textual values in rows (defensive).
UPDATE "cash_orders"
SET "kind" = 'MKO'
WHERE "kind"::text = 'PKO';

UPDATE "cash_orders"
SET "kind" = 'MXO'
WHERE "kind"::text = 'RKO';

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^PKO-', 'MKO-')
WHERE "order_number" LIKE 'PKO-%';

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^RKO-', 'MXO-')
WHERE "order_number" LIKE 'RKO-%';

COMMIT;

