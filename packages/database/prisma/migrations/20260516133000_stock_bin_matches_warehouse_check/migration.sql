-- M9: bin must belong to the same warehouse as stock row (DB-enforced integrity).
-- PostgreSQL does not allow subqueries in CHECK constraints — use BEFORE triggers.

UPDATE "stock_items" si
SET "bin_id" = NULL
FROM "warehouse_bins" wb
WHERE si."bin_id" = wb."id"
  AND si."warehouse_id" <> wb."warehouse_id";

UPDATE "stock_movements" sm
SET "bin_id" = NULL
FROM "warehouse_bins" wb
WHERE sm."bin_id" = wb."id"
  AND sm."warehouse_id" <> wb."warehouse_id";

ALTER TABLE "stock_items" DROP CONSTRAINT IF EXISTS "stock_items_bin_same_warehouse_chk";
ALTER TABLE "stock_movements" DROP CONSTRAINT IF EXISTS "stock_movements_bin_same_warehouse_chk";

CREATE OR REPLACE FUNCTION "stock_items_bin_warehouse_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."bin_id" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "warehouse_bins" wb
      WHERE wb."id" = NEW."bin_id"
        AND wb."warehouse_id" = NEW."warehouse_id"
    ) THEN
      RAISE EXCEPTION 'stock_items: bin_id must reference a bin in the same warehouse as warehouse_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "stock_items_bin_warehouse_trg" ON "stock_items";
CREATE TRIGGER "stock_items_bin_warehouse_trg"
  BEFORE INSERT OR UPDATE OF "bin_id", "warehouse_id" ON "stock_items"
  FOR EACH ROW
  EXECUTE PROCEDURE "stock_items_bin_warehouse_guard"();

CREATE OR REPLACE FUNCTION "stock_movements_bin_warehouse_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."bin_id" IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "warehouse_bins" wb
      WHERE wb."id" = NEW."bin_id"
        AND wb."warehouse_id" = NEW."warehouse_id"
    ) THEN
      RAISE EXCEPTION 'stock_movements: bin_id must reference a bin in the same warehouse as warehouse_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "stock_movements_bin_warehouse_trg" ON "stock_movements";
CREATE TRIGGER "stock_movements_bin_warehouse_trg"
  BEFORE INSERT OR UPDATE OF "bin_id", "warehouse_id" ON "stock_movements"
  FOR EACH ROW
  EXECUTE PROCEDURE "stock_movements_bin_warehouse_guard"();
