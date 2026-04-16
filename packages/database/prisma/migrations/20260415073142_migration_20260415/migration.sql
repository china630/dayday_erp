/*
  Warnings:

  - You are about to drop the column `type` on the `absences` table. All the data in the column will be lost.
  - Added the required column `absence_type_id` to the `absences` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AbsencePayFormula" AS ENUM ('LABOR_LEAVE_304', 'SICK_LEAVE_STAJ', 'UNPAID_RECORD');

-- CreateEnum
CREATE TYPE "HoldingAccessRole" AS ENUM ('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER');

-- AlterEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BankStatementLineOrigin') THEN
    CREATE TYPE "BankStatementLineOrigin" AS ENUM (
      'FILE_IMPORT',
      'DIRECT_SYNC',
      'WEBHOOK',
      'INVOICE_PAYMENT_SYSTEM',
      'MANUAL_CASH_OUT',
      'MANUAL_BANK_ENTRY'
    );
  END IF;
END $$;



-- AlterEnum
ALTER TYPE "CounterpartyRole" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "absences" DROP COLUMN "type",
ADD COLUMN     "absence_type_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "chart_entry_id" UUID;

-- AlterTable
ALTER TABLE "bank_statement_lines" ADD COLUMN     "cash_flow_item_id" UUID;

-- AlterTable
ALTER TABLE "cash_orders" ADD COLUMN     "cash_desk_id" UUID,
ADD COLUMN     "cash_flow_item_id" UUID,
ADD COLUMN     "withholding_tax_amount" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "patronymic" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "holding_id" UUID,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "product_recipe_lines" ADD COLUMN     "waste_factor" DECIMAL(19,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_service" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "default_warehouse_id" UUID;

-- DropEnum
DROP TYPE "AbsenceType";

-- CreateTable
CREATE TABLE "absence_types" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_az" TEXT NOT NULL,
    "is_paid" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "formula" "AbsencePayFormula" NOT NULL,
    "max_calendar_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "cash_profile" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_of_accounts_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_desks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "employee_id" UUID,
    "currencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_desks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holding_memberships" (
    "user_id" UUID NOT NULL,
    "holding_id" UUID NOT NULL,
    "role" "HoldingAccessRole" NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holding_memberships_pkey" PRIMARY KEY ("user_id","holding_id")
);

-- CreateTable
CREATE TABLE "holdings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "base_currency" TEXT NOT NULL DEFAULT 'AZN',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "absence_types_organization_id_idx" ON "absence_types"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "absence_types_organization_id_code_key" ON "absence_types"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_entries_code_key" ON "chart_of_accounts_entries"("code");

-- CreateIndex
CREATE INDEX "cash_flow_items_organization_id_idx" ON "cash_flow_items"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_items_organization_id_code_key" ON "cash_flow_items"("organization_id", "code");

-- CreateIndex
CREATE INDEX "cash_desks_organization_id_idx" ON "cash_desks"("organization_id");

-- CreateIndex
CREATE INDEX "cash_desks_employee_id_idx" ON "cash_desks"("employee_id");

-- CreateIndex
CREATE INDEX "holding_memberships_holding_id_idx" ON "holding_memberships"("holding_id");

-- CreateIndex
CREATE UNIQUE INDEX "holdings_name_key" ON "holdings"("name");

-- CreateIndex
CREATE INDEX "holdings_owner_id_idx" ON "holdings"("owner_id");

-- CreateIndex
CREATE INDEX "absences_absence_type_id_idx" ON "absences"("absence_type_id");

-- CreateIndex
CREATE INDEX "accounts_chart_entry_id_idx" ON "accounts"("chart_entry_id");

-- CreateIndex
CREATE INDEX "bank_statement_lines_cash_flow_item_id_idx" ON "bank_statement_lines"("cash_flow_item_id");

-- CreateIndex
CREATE INDEX "cash_orders_cash_flow_item_id_idx" ON "cash_orders"("cash_flow_item_id");

-- CreateIndex
CREATE INDEX "cash_orders_cash_desk_id_idx" ON "cash_orders"("cash_desk_id");

-- CreateIndex
CREATE INDEX "organizations_holding_id_idx" ON "organizations"("holding_id");

-- CreateIndex
CREATE INDEX "users_default_warehouse_id_idx" ON "users"("default_warehouse_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_absence_type_id_fkey" FOREIGN KEY ("absence_type_id") REFERENCES "absence_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_warehouse_id_fkey" FOREIGN KEY ("default_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_chart_entry_id_fkey" FOREIGN KEY ("chart_entry_id") REFERENCES "chart_of_accounts_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_cash_flow_item_id_fkey" FOREIGN KEY ("cash_flow_item_id") REFERENCES "cash_flow_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_orders" ADD CONSTRAINT "cash_orders_cash_flow_item_id_fkey" FOREIGN KEY ("cash_flow_item_id") REFERENCES "cash_flow_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_orders" ADD CONSTRAINT "cash_orders_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_items" ADD CONSTRAINT "cash_flow_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desks" ADD CONSTRAINT "cash_desks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desks" ADD CONSTRAINT "cash_desks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_memberships" ADD CONSTRAINT "holding_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holding_memberships" ADD CONSTRAINT "holding_memberships_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
