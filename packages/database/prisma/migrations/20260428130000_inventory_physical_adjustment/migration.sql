-- M9: Physical inventory / write-off / surplus documents (InventoryAdjustment + lines)

CREATE TYPE "InventoryAdjustmentStatus" AS ENUM ('DRAFT', 'POSTED');
CREATE TYPE "InventoryAdjustmentDocType" AS ENUM ('WRITE_OFF', 'SURPLUS', 'INVENTORY_COUNT');

CREATE TABLE "inventory_adjustments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "InventoryAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL DEFAULT '',
    "doc_type" "InventoryAdjustmentDocType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_adjustment_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "adjustment_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "expected_quantity" DECIMAL(19,4) NOT NULL,
    "actual_quantity" DECIMAL(19,4) NOT NULL,
    "delta_quantity" DECIMAL(19,4) NOT NULL,
    "unit_cost" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_adjustment_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "inventory_adjustment_lines_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inventory_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_adjustment_lines" ADD CONSTRAINT "inventory_adjustment_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "inventory_adjustment_lines_adjustment_id_product_id_key" ON "inventory_adjustment_lines"("adjustment_id", "product_id");
CREATE INDEX "inventory_adjustment_lines_product_id_idx" ON "inventory_adjustment_lines"("product_id");

CREATE INDEX "inventory_adjustments_organization_id_warehouse_id_date_idx" ON "inventory_adjustments"("organization_id", "warehouse_id", "date");
CREATE INDEX "inventory_adjustments_organization_id_status_idx" ON "inventory_adjustments"("organization_id", "status");
