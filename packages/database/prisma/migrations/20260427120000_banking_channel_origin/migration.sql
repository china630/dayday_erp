-- Treasury v7.1: канал банк/касса и источник строки реестра
CREATE TYPE "BankStatementChannel" AS ENUM ('BANK', 'CASH');
CREATE TYPE "BankStatementLineOrigin" AS ENUM (
  'FILE_IMPORT',
  'DIRECT_SYNC',
  'WEBHOOK',
  'INVOICE_PAYMENT_SYSTEM',
  'MANUAL_CASH_OUT'
);

ALTER TABLE "bank_statements" ADD COLUMN "channel" "BankStatementChannel" NOT NULL DEFAULT 'BANK';
ALTER TABLE "bank_statement_lines" ADD COLUMN "origin" "BankStatementLineOrigin" NOT NULL DEFAULT 'FILE_IMPORT';
