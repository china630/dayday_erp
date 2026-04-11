-- CreateEnum
CREATE TYPE "CbarRateStatus" AS ENUM ('PRELIMINARY', 'FINAL');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateTable
CREATE TABLE "cbar_official_rates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "rate_date" DATE NOT NULL,
    "currency_code" TEXT NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "nominal" INTEGER NOT NULL,
    "rate" DECIMAL(19,8) NOT NULL,
    "status" "CbarRateStatus" NOT NULL DEFAULT 'PRELIMINARY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cbar_official_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "fin_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "contract_number" TEXT NOT NULL,
    "hire_date" DATE NOT NULL,
    "gross_salary" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_slips" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "gross" DECIMAL(19,4) NOT NULL,
    "income_tax" DECIMAL(19,4) NOT NULL,
    "dsmf_employee" DECIMAL(19,4) NOT NULL,
    "its_medical" DECIMAL(19,4) NOT NULL,
    "unemployment" DECIMAL(19,4) NOT NULL,
    "net_pay" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_slips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cbar_official_rates_rate_date_currency_code_key" ON "cbar_official_rates"("rate_date", "currency_code");

-- CreateIndex
CREATE INDEX "cbar_official_rates_rate_date_status_idx" ON "cbar_official_rates"("rate_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organization_id_fin_code_key" ON "employees"("organization_id", "fin_code");

-- CreateIndex
CREATE INDEX "employees_organization_id_created_at_idx" ON "employees"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_organization_id_year_month_key" ON "payroll_runs"("organization_id", "year", "month");

-- CreateIndex
CREATE INDEX "payroll_runs_organization_id_status_idx" ON "payroll_runs"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_slips_payroll_run_id_employee_id_key" ON "payroll_slips"("payroll_run_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_slips_organization_id_payroll_run_id_idx" ON "payroll_slips"("organization_id", "payroll_run_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
