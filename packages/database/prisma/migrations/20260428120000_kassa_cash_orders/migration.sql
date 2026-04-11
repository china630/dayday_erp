-- Kassa: PKO/RKO, авансовые отчёты, подотчёт 244 (PRD §4.5–4.6)

CREATE TYPE "CashOrderKind" AS ENUM ('PKO', 'RKO');
CREATE TYPE "CashOrderStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
CREATE TYPE "CashOrderPkoSubtype" AS ENUM (
  'INCOME_FROM_CUSTOMER',
  'RETURN_FROM_ACCOUNTABLE',
  'WITHDRAWAL_FROM_BANK',
  'OTHER'
);
CREATE TYPE "CashOrderRkoSubtype" AS ENUM (
  'SALARY',
  'SUPPLIER_PAYMENT',
  'ACCOUNTABLE_ISSUE',
  'BANK_DEPOSIT',
  'OTHER'
);
CREATE TYPE "AdvanceReportStatus" AS ENUM ('DRAFT', 'POSTED');

ALTER TABLE "employees" ADD COLUMN "accountable_account_code_244" TEXT;

CREATE TABLE "cash_orders" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "organization_id" UUID NOT NULL,
  "order_number" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "kind" "CashOrderKind" NOT NULL,
  "status" "CashOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "pko_subtype" "CashOrderPkoSubtype",
  "rko_subtype" "CashOrderRkoSubtype",
  "currency" TEXT NOT NULL DEFAULT 'AZN',
  "amount" DECIMAL(19, 4) NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT '',
  "notes" TEXT,
  "cash_account_code" TEXT NOT NULL DEFAULT '101.01',
  "offset_account_code" TEXT,
  "counterparty_id" UUID,
  "employee_id" UUID,
  "source_invoice_id" UUID,
  "source_invoice_payment_id" UUID UNIQUE,
  "skip_journal_posting" BOOLEAN NOT NULL DEFAULT false,
  "linked_transaction_id" UUID,
  "posted_transaction_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "cash_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cash_orders_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cash_orders_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cash_orders_source_invoice_id_fkey" FOREIGN KEY ("source_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cash_orders_linked_transaction_id_fkey" FOREIGN KEY ("linked_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cash_orders_posted_transaction_id_fkey" FOREIGN KEY ("posted_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cash_orders_organization_id_order_number_key" ON "cash_orders"("organization_id", "order_number");
CREATE INDEX "cash_orders_organization_id_date_idx" ON "cash_orders"("organization_id", "date");
CREATE INDEX "cash_orders_organization_id_status_idx" ON "cash_orders"("organization_id", "status");

CREATE TABLE "advance_reports" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "report_date" DATE NOT NULL,
  "expense_lines" JSONB NOT NULL DEFAULT '[]',
  "total_declared" DECIMAL(19, 4) NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT '',
  "status" "AdvanceReportStatus" NOT NULL DEFAULT 'DRAFT',
  "transaction_id" UUID UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "advance_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "advance_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "advance_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "advance_reports_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "advance_reports_organization_id_employee_id_idx" ON "advance_reports"("organization_id", "employee_id");
