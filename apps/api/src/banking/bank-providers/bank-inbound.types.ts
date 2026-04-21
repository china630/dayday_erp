import type { BankStatementLineType, Prisma } from "@dayday/database";

/** Унифицированная операция из банка перед записью в bank_statement_lines */
export type InboundBankTransaction = {
  integrationKey: string;
  amount: Prisma.Decimal;
  type: BankStatementLineType;
  counterpartyTaxId: string | null;
  valueDate: Date;
  description: string | null;
};

export type DirectSyncTrigger = "manual" | "cron" | "webhook";
