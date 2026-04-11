-- Табель (Timesheet) + строки + связь с ведомостью; утверждение отсутствий для синхронизации

CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "TimesheetEntryType" AS ENUM ('WORK', 'VACATION', 'SICK', 'OFF', 'BUSINESS_TRIP');

ALTER TABLE "absences" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "timesheets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "timesheets_organization_id_year_month_key" ON "timesheets"("organization_id", "year", "month");
CREATE INDEX "timesheets_organization_id_year_month_idx" ON "timesheets"("organization_id", "year", "month");

ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "timesheet_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "timesheet_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "day_date" DATE NOT NULL,
    "type" "TimesheetEntryType" NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL DEFAULT 8,
    "locked_from_absence" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "timesheet_entries_timesheet_id_employee_id_day_date_key" ON "timesheet_entries"("timesheet_id", "employee_id", "day_date");
CREATE INDEX "timesheet_entries_timesheet_id_employee_id_idx" ON "timesheet_entries"("timesheet_id", "employee_id");

ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_runs" ADD COLUMN "timesheet_id" UUID;

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll_slips" ADD COLUMN "timesheet_work_days" INTEGER;
ALTER TABLE "payroll_slips" ADD COLUMN "timesheet_vacation_days" INTEGER;
ALTER TABLE "payroll_slips" ADD COLUMN "timesheet_sick_days" INTEGER;
ALTER TABLE "payroll_slips" ADD COLUMN "timesheet_business_trip_days" INTEGER;
