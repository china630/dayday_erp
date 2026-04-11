-- AlterEnum
ALTER TYPE "StockMovementReason" ADD VALUE 'MANUFACTURING';

-- CreateTable
CREATE TABLE "product_recipes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "finished_product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_recipe_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "recipe_id" UUID NOT NULL,
    "component_product_id" UUID NOT NULL,
    "quantity_per_unit" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "inventory_number" TEXT NOT NULL,
    "commissioning_date" DATE NOT NULL,
    "initial_cost" DECIMAL(19,4) NOT NULL,
    "useful_life_months" INTEGER NOT NULL,
    "salvage_value" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "booked_depreciation" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset_depreciation_months" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "fixed_asset_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixed_asset_depreciation_months_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_recipes_finished_product_id_key" ON "product_recipes"("finished_product_id");
CREATE INDEX "product_recipes_organization_id_idx" ON "product_recipes"("organization_id");

CREATE UNIQUE INDEX "product_recipe_lines_recipe_id_component_product_id_key" ON "product_recipe_lines"("recipe_id", "component_product_id");
CREATE INDEX "product_recipe_lines_recipe_id_idx" ON "product_recipe_lines"("recipe_id");

CREATE UNIQUE INDEX "fixed_assets_organization_id_inventory_number_key" ON "fixed_assets"("organization_id", "inventory_number");
CREATE INDEX "fixed_assets_organization_id_commissioning_date_idx" ON "fixed_assets"("organization_id", "commissioning_date");

CREATE UNIQUE INDEX "fixed_asset_depreciation_months_fixed_asset_id_year_month_key" ON "fixed_asset_depreciation_months"("fixed_asset_id", "year", "month");
CREATE INDEX "fixed_asset_depreciation_months_organization_id_year_month_idx" ON "fixed_asset_depreciation_months"("organization_id", "year", "month");

ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_finished_product_id_fkey" FOREIGN KEY ("finished_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_recipe_lines" ADD CONSTRAINT "product_recipe_lines_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "product_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_recipe_lines" ADD CONSTRAINT "product_recipe_lines_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fixed_asset_depreciation_months" ADD CONSTRAINT "fixed_asset_depreciation_months_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_depreciation_months" ADD CONSTRAINT "fixed_asset_depreciation_months_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixed_asset_depreciation_months" ADD CONSTRAINT "fixed_asset_depreciation_months_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
