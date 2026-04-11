-- Optional FK for PayrollRun -> Transaction (reporting / P&L by department)
ALTER TABLE "payroll_runs" DROP CONSTRAINT IF EXISTS "payroll_runs_transaction_id_fkey";
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
