import { Prisma } from "@dayday/database";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const RM_HALF_UP = 4;

export function roundMoney2(d: Decimal): Decimal {
  return new Decimal(d.toDecimalPlaces(2, RM_HALF_UP));
}
