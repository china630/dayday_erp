import { Prisma } from "@dayday/database";
import { roundMoney2, type PayrollBreakdownPrivate } from "../hr/payroll-calculator";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

function minDec(a: Decimal, b: Decimal): Decimal {
  return a.lessThanOrEqualTo(b) ? a : b;
}

export type TaxCalculatorOrgSettings = {
  /**
   * DSMF employer preferential rate for private non‑oil sector.
   * - false/undefined: 22%
   * - true: 15%
   */
  dsmfEmployerPreferential?: boolean;
};

export function parsePayrollTaxSettings(settings: unknown): TaxCalculatorOrgSettings {
  const s = (settings ?? {}) as Record<string, unknown>;
  const payroll = (s.payroll ?? {}) as Record<string, unknown>;
  return {
    dsmfEmployerPreferential: payroll.dsmfEmployerPreferential === true,
  };
}

/**
 * Azerbaijan (AR) — Private Non‑Oil sector tax engine (v16.1).
 * Each line is rounded to 2 decimals (ROUND_HALF_UP) before net.
 */
export function calculatePrivateNonOilPayrollV161(
  grossRaw: Decimal,
  orgSettings?: TaxCalculatorOrgSettings,
): PayrollBreakdownPrivate {
  const gross = roundMoney2(grossRaw);

  // Income tax: 0% up to 8000 AZN, 14% above.
  const eightK = new Decimal(8000);
  const incomeTax = roundMoney2(
    gross.gt(eightK) ? gross.sub(eightK).mul(0.14) : new Decimal(0),
  );

  // DSMF worker: 10% up to 200 + 10 AZN on excess.
  const twoH = new Decimal(200);
  const dsmfWorker = roundMoney2(
    gross.lte(twoH) ? gross.mul(0.1) : new Decimal(20).add(10),
  );

  // DSMF employer: 22% standard, 15% preferential (org setting).
  const dsmfEmployerRate =
    orgSettings?.dsmfEmployerPreferential === true ? new Decimal(0.15) : new Decimal(0.22);
  const dsmfEmployer = roundMoney2(gross.mul(dsmfEmployerRate));

  // Unemployment: 0.5% worker + 0.5% employer.
  const unemploymentWorker = roundMoney2(gross.mul(0.005));
  const unemploymentEmployer = roundMoney2(gross.mul(0.005));

  // Medical insurance (İTS): progressive 1%–2%.
  // v16.1 brackets used by engine:
  // - 1% on the first 8000 AZN
  // - 2% on the excess
  const itsBase = minDec(gross, eightK);
  const itsExcess = gross.gt(eightK) ? gross.sub(eightK) : new Decimal(0);
  const itsWorker = roundMoney2(itsBase.mul(0.01).add(itsExcess.mul(0.02)));
  const itsEmployer = roundMoney2(itsBase.mul(0.01).add(itsExcess.mul(0.02)));

  const net = roundMoney2(
    gross.sub(incomeTax).sub(dsmfWorker).sub(itsWorker).sub(unemploymentWorker),
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

