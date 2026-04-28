import { Prisma } from "@dayday/database";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/** decimal.js: ROUND_HALF_UP — округление каждого налога до 2 знаков. */
const RM_HALF_UP = 4;

export function roundMoney2(d: Decimal): Decimal {
  return new Decimal(d.toDecimalPlaces(2, RM_HALF_UP));
}

export type PayrollBreakdownPrivate = {
  gross: Decimal;
  incomeTax: Decimal;
  dsmfWorker: Decimal;
  dsmfEmployer: Decimal;
  itsWorker: Decimal;
  itsEmployer: Decimal;
  unemploymentWorker: Decimal;
  unemploymentEmployer: Decimal;
  /** Удержание с ГПХ (фикс. соц.), для штатных — 0 */
  contractorSocialWithheld: Decimal;
  net: Decimal;
};

