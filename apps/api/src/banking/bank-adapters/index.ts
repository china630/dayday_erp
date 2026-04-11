import type { BankTransactionAdapter } from "./bank-adapter.interface";
import { abbBankAdapter } from "./abb.adapter";
import { kapitalBankAdapter } from "./kapital.adapter";
import { pashaBankAdapter } from "./pasha.adapter";

export type BankAdapterKey = "pasha" | "abb" | "kapital";

const MAP: Record<BankAdapterKey, BankTransactionAdapter> = {
  pasha: pashaBankAdapter,
  abb: abbBankAdapter,
  kapital: kapitalBankAdapter,
};

export function getBankAdapter(key: BankAdapterKey): BankTransactionAdapter {
  return MAP[key];
}

export { abbBankAdapter, kapitalBankAdapter, pashaBankAdapter };
export type { BankTransactionAdapter } from "./bank-adapter.interface";
