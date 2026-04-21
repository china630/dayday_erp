-- FIFO ordering: business document date (backfill from created_at).
ALTER TABLE "stock_movements" ADD COLUMN "document_date" TIMESTAMPTZ;

UPDATE "stock_movements" SET "document_date" = "created_at" WHERE "document_date" IS NULL;

ALTER TABLE "stock_movements" ALTER COLUMN "document_date" SET NOT NULL;

DROP INDEX IF EXISTS "stock_movements_organization_id_warehouse_id_created_at_idx";
DROP INDEX IF EXISTS "stock_movements_organization_id_product_id_created_at_idx";

CREATE INDEX "stock_movements_organization_id_warehouse_id_document_date_created_idx" ON "stock_movements" ("organization_id", "warehouse_id", "document_date", "created_at");

CREATE INDEX "stock_movements_organization_id_product_id_document_date_created_idx" ON "stock_movements" ("organization_id", "product_id", "document_date", "created_at");
