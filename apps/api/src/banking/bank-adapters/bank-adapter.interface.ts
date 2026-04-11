import type { InboundBankTransaction } from "../bank-providers/bank-inbound.types";

/** Маппинг ответа REST API банка → операции для ingest */
export interface BankTransactionAdapter {
  readonly bankDisplayName: string;
  mapResponse(json: unknown): InboundBankTransaction[];
}
