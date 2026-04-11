import { BankStatementLineType, Decimal } from "@dayday/database";

export type MockBankTransaction = {
  integrationKey: string;
  amount: Decimal;
  type: BankStatementLineType;
  counterpartyTaxId: string | null;
  valueDate: Date;
  description: string;
};

/** Демо-VÖEN (10 цифр) для автосверки с тестовыми контрагентами */
const DEMO_VOEN_A = "1701234561";
const DEMO_VOEN_B = "2701234562";

/**
 * Заглушка Pasha Bank: периодически «присылает» одну входящую операцию.
 */
export function fetchMockPashaTransactions(
  organizationId: string,
  tick: number,
): MockBankTransaction[] {
  if (tick % 2 !== 0) return [];
  const amt = new Decimal(String(100 + (tick % 7) * 25));
  return [
    {
      integrationKey: `pasha:${organizationId}:t${tick}`,
      amount: amt,
      type: BankStatementLineType.INFLOW,
      counterpartyTaxId: DEMO_VOEN_A,
      valueDate: new Date(),
      description: `Pasha Bank API (mock) · tick ${tick}`,
    },
  ];
}

/**
 * Заглушка ABB: на других «тиках», другая сумма/VÖEN.
 */
export function fetchMockAbbTransactions(
  organizationId: string,
  tick: number,
): MockBankTransaction[] {
  if (tick % 3 !== 0) return [];
  return [
    {
      integrationKey: `abb:${organizationId}:t${tick}`,
      amount: new Decimal("333.3300"),
      type: BankStatementLineType.INFLOW,
      counterpartyTaxId: DEMO_VOEN_B,
      valueDate: new Date(),
      description: `ABB API (mock) · tick ${tick}`,
    },
  ];
}
