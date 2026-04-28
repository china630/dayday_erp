-- Roadmap 95+ (M9): warehouse bins and manufacturing byproducts

CREATE TABLE "warehouse_bins" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "warehouse_bins_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "warehouse_bins"
ADD CONSTRAINT "warehouse_bins_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "warehouse_bins"
ADD CONSTRAINT "warehouse_bins_warehouse_id_fkey"
FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "warehouse_bins_warehouse_id_code_key"
ON "warehouse_bins"("warehouse_id", "code");

CREATE INDEX "warehouse_bins_org_wh_idx"
ON "warehouse_bins"("organization_id", "warehouse_id");

CREATE INDEX "warehouse_bins_wh_barcode_idx"
ON "warehouse_bins"("warehouse_id", "barcode");

ALTER TABLE "stock_items" ADD COLUMN "bin_id" UUID;
ALTER TABLE "stock_movements" ADD COLUMN "bin_id" UUID;

ALTER TABLE "stock_items"
ADD CONSTRAINT "stock_items_bin_id_fkey"
FOREIGN KEY ("bin_id") REFERENCES "warehouse_bins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
ADD CONSTRAINT "stock_movements_bin_id_fkey"
FOREIGN KEY ("bin_id") REFERENCES "warehouse_bins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "product_recipe_byproducts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "recipe_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_per_unit" DECIMAL(19,4) NOT NULL,
    "cost_factor" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_recipe_byproducts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "product_recipe_byproducts"
ADD CONSTRAINT "product_recipe_byproducts_recipe_id_fkey"
FOREIGN KEY ("recipe_id") REFERENCES "product_recipes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_recipe_byproducts"
ADD CONSTRAINT "product_recipe_byproducts_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "product_recipe_byproducts_recipe_id_product_id_key"
ON "product_recipe_byproducts"("recipe_id", "product_id");

CREATE INDEX "product_recipe_byproducts_recipe_id_idx"
ON "product_recipe_byproducts"("recipe_id");
