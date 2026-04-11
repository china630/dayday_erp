-- Employee: частный сектор, ФИН 7 символов, salary, startDate, position
ALTER TABLE "employees" DROP COLUMN IF EXISTS "contract_number";

ALTER TABLE "employees" RENAME COLUMN "gross_salary" TO "salary";
ALTER TABLE "employees" RENAME COLUMN "hire_date" TO "start_date";

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "position" TEXT NOT NULL DEFAULT '';

-- Листовки: полный расчёт работник/работодатель
DROP TABLE IF EXISTS "payroll_slips";

CREATE TABLE "payroll_slips" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "gross" DECIMAL(19,4) NOT NULL,
    "income_tax" DECIMAL(19,4) NOT NULL,
    "dsmf_worker" DECIMAL(19,4) NOT NULL,
    "dsmf_employer" DECIMAL(19,4) NOT NULL,
    "its_worker" DECIMAL(19,4) NOT NULL,
    "its_employer" DECIMAL(19,4) NOT NULL,
    "unemployment_worker" DECIMAL(19,4) NOT NULL,
    "unemployment_employer" DECIMAL(19,4) NOT NULL,
    "net" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_slips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_slips_payroll_run_id_employee_id_key" ON "payroll_slips"("payroll_run_id", "employee_id");

CREATE INDEX "payroll_slips_organization_id_payroll_run_id_idx" ON "payroll_slips"("organization_id", "payroll_run_id");

ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_slips" ADD CONSTRAINT "payroll_slips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
