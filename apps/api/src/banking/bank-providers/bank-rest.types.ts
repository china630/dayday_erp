import type { InboundBankTransaction } from "./bank-inbound.types";

/** Фрагмент organization.settings.bankingDirect для REST-опроса банков */
export type BankingDirectRestBankConfig = {
  enabled?: boolean;
  /** GET URL списка операций (как выдал банк при подключении) */
  url?: string;
  /** Bearer-токен (в БД — зашифрован через BankingCredentialsService) */
  token?: string;
};

export type BankingDirectRestSettings = {
  syncMode?: "mock" | "rest";
  pasha?: BankingDirectRestBankConfig;
  abb?: BankingDirectRestBankConfig;
  kapital?: BankingDirectRestBankConfig;
};

export type RestPollResult = {
  bankName: string;
  transactions: InboundBankTransaction[];
  skippedReason?: string;
};

export type RestFetchOutcome = {
  results: RestPollResult[];
  /** Нет URL/токена для не отключённого банка */
  configWarnings: string[];
};
