export type BankBalanceItem = {
  accountId: string;
  iban?: string | null;
  currency: string;
  amount: string;
};

export type BankStatementItem = {
  externalId: string;
  amount: string;
  currency: string;
  date: string;
  description?: string | null;
  counterpartyIban?: string | null;
  counterpartyName?: string | null;
};

export type PaymentDraftRequest = {
  fromAccountIban: string;
  toIban: string;
  amount: string;
  currency: string;
  purpose: string;
  reference?: string;
};

export type PaymentDraftResult = {
  draftId: string;
  status: string;
  providerPayload?: unknown;
};

export interface BankingProviderInterface {
  getBalances(): Promise<BankBalanceItem[]>;
  getStatements(from: string, to: string): Promise<BankStatementItem[]>;
  sendPaymentDraft(payload: PaymentDraftRequest): Promise<PaymentDraftResult>;
}

