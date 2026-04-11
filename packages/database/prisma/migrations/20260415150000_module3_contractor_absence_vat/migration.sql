-- CreateEnum
CREATE TYPE "EmployeeKind" AS ENUM ('EMPLOYEE', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('VACATION', 'SICK_LEAVE');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "kind" "EmployeeKind" NOT NULL DEFAULT 'EMPLOYEE';
ALTER TABLE "employees" ADD COLUMN "voen" TEXT;
ALTER TABLE "employees" ADD COLUMN "contractor_monthly_social_azn" DECIMAL(19,4);

-- AlterTable
ALTER TABLE "payroll_slips" ADD COLUMN "contractor_social_withheld" DECIMAL(19,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "absences" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "AbsenceType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "absences_organization_id_employee_id_idx" ON "absences"("organization_id", "employee_id");
CREATE INDEX "absences_organization_id_start_date_idx" ON "absences"("organization_id", "start_date");

ALTER TABLE "absences" ADD CONSTRAINT "absences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "absences" ADD CONSTRAINT "absences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
