-- CashOrderKind: align PostgreSQL enum with Prisma schema (KMO, KXO only).
-- 20260428120000 created PKO/RKO; schema/code use KMO/KXO. Renames only (PostgreSQL updates row values on RENAME VALUE).
-- Previously shipped as manual scripts: migration-cashorderkind-mko-mxo.sql, migration-cashorderkind-kmo-kxo.sql

-- PKO/RKO -> MKO/MXO
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'PKO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''PKO'' TO ''MKO''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'RKO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''RKO'' TO ''MXO''';
  END IF;
END $$;

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^PKO-', 'MKO-')
WHERE "order_number" LIKE 'PKO-%';

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^RKO-', 'MXO-')
WHERE "order_number" LIKE 'RKO-%';

-- MKO/MXO -> KMO/KXO
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'MKO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''MKO'' TO ''KMO''';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'CashOrderKind' AND e.enumlabel = 'MXO'
  ) THEN
    EXECUTE 'ALTER TYPE "CashOrderKind" RENAME VALUE ''MXO'' TO ''KXO''';
  END IF;
END $$;

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^MKO-', 'KMO-')
WHERE "order_number" LIKE 'MKO-%';

UPDATE "cash_orders"
SET "order_number" = regexp_replace("order_number", '^MXO-', 'KXO-')
WHERE "order_number" LIKE 'MXO-%';
