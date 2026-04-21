import { Prisma } from "@dayday/database";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/** decimal.js: ROUND_HALF_UP — округление каждого налога до 2 знаков. */
const RM_HALF_UP = 4;

export function roundMoney2(d: Decimal): Decimal {
  return new Decimal(d.toDecimalPlaces(2, RM_HALF_UP));
}

function minDec(a: Decimal, b: Decimal): Decimal {
  return a.lessThanOrEqualTo(b) ? a : b;
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

/**
 * Частный ненефтяной сектор (AZN). Каждый налог округляется ROUND_HALF_UP до 2 знаков отдельно.
 */
export function calculatePrivateNonOilPayroll(
  grossRaw: Decimal,
): PayrollBreakdownPrivate {
  const gross = roundMoney2(grossRaw);
  const eightK = new Decimal(8000);
  const twoH = new Decimal(200);

  const incomeTax = roundMoney2(
    gross.gt(eightK) ? gross.sub(eightK).mul(0.14) : new Decimal(0),
  );

  const dsmfWorker = roundMoney2(
    gross.lte(twoH)
      ? gross.mul(0.03)
      : new Decimal(6).add(gross.sub(twoH).mul(0.1)),
  );

  const dsmfEmployer = roundMoney2(
    gross.lte(twoH)
      ? gross.mul(0.22)
      : new Decimal(44).add(gross.sub(twoH).mul(0.15)),
  );

  const itsBase = minDec(gross, eightK);
  const itsWorker = roundMoney2(itsBase.mul(0.02));
  const itsEmployer = roundMoney2(itsBase.mul(0.02));

  const unemploymentWorker = roundMoney2(gross.mul(0.005));
  const unemploymentEmployer = roundMoney2(gross.mul(0.005));

  const net = roundMoney2(
    gross
      .sub(incomeTax)
      .sub(dsmfWorker)
      .sub(itsWorker)
      .sub(unemploymentWorker),
  );

  return {
    gross,
    incomeTax,
    dsmfWorker,
    dsmfEmployer,
    itsWorker,
    itsEmployer,
    unemploymentWorker,
    unemploymentEmployer,
    contractorSocialWithheld: new Decimal(0),
    net,
  };
}

/**
 * ГПХ / микропредприниматель-налогоплательщик: удержание 5% с выплаты (AZN).
 * Опционально — фиксированная сумма соц. удержаний с выплаты в месяц.
 */
export function calculateContractorMicroPayroll(
  grossRaw: Decimal,
  monthlyFixedSocialAzn?: Decimal | null,
): PayrollBreakdownPrivate {
  const gross = roundMoney2(grossRaw);
  const incomeTax = roundMoney2(gross.mul(0.05));
  const fixed =
    monthlyFixedSocialAzn != null && monthlyFixedSocialAzn.gt(0)
      ? roundMoney2(monthlyFixedSocialAzn)
      : new Decimal(0);
  const net = roundMoney2(gross.sub(incomeTax).sub(fixed));
  return {
    gross,
    incomeTax,
    dsmfWorker: new Decimal(0),
    dsmfEmployer: new Decimal(0),
    itsWorker: new Decimal(0),
    itsEmployer: new Decimal(0),
    unemploymentWorker: new Decimal(0),
    unemploymentEmployer: new Decimal(0),
    contractorSocialWithheld: fixed,
    net,
  };
}
