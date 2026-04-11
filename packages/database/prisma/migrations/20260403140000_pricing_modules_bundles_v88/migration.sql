-- v8.8: Dynamic Billing Constructor — каталог модулей и пакеты

CREATE TABLE "pricing_modules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_per_month" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_modules_key_key" ON "pricing_modules"("key");

CREATE TABLE "pricing_bundles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "module_keys" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_bundles_pkey" PRIMARY KEY ("id")
);

INSERT INTO "pricing_modules" ("key", "name", "price_per_month", "sort_order")
VALUES
  ('banking_pro', 'Banking Pro', 49, 0),
  ('kassa_pro', 'Kassa Pro', 29, 1),
  ('manufacturing', 'Manufacturing', 79, 2),
  ('hr_full', 'HR Full', 39, 3),
  ('warehouse', 'Warehouse', 35, 4),
  ('fixed_assets', 'Fixed Assets', 25, 5),
  ('ifrs_mapping', 'IFRS mapping', 45, 6);
