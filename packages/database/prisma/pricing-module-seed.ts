import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export type PricingModuleSeedRow = {
  key: string;
  name: string;
  pricePerMonth: number;
  sortOrder: number;
};

/**
 * Единственный источник дефолтов для `pricing_modules` (v12.4).
 * Цифры согласованы с legacy `pricing` (MODULE): 15, 19, 25, 39, 19, 29 AZN/мес.;
 * подмножество {29, 19, 15, 25} — IFRS, Banking, Kassa, Warehouse.
 */
export const PRICING_MODULE_SEED_DEFAULTS: ReadonlyArray<PricingModuleSeedRow> = [
  { key: "kassa_pro", name: "Kassa Pro", pricePerMonth: 15, sortOrder: 0 },
  { key: "banking_pro", name: "Banking Pro", pricePerMonth: 19, sortOrder: 1 },
  { key: "inventory", name: "Warehouse", pricePerMonth: 25, sortOrder: 2 },
  { key: "manufacturing", name: "Manufacturing", pricePerMonth: 39, sortOrder: 3 },
  { key: "hr_full", name: "HR", pricePerMonth: 19, sortOrder: 4 },
  { key: "ifrs_mapping", name: "IFRS", pricePerMonth: 29, sortOrder: 5 },
];

/**
 * Первичное наполнение `pricing_modules`, если таблица пуста (как при `prisma db seed`).
 * Не перезаписывает существующие строки — приоритет у данных в БД.
 */
export async function seedPricingModuleIfEmpty(prisma: PrismaClient): Promise<void> {
  const n = await prisma.pricingModule.count();
  if (n > 0) return;
  for (const m of PRICING_MODULE_SEED_DEFAULTS) {
    await prisma.pricingModule.create({
      data: {
        key: m.key,
        name: m.name,
        pricePerMonth: new Prisma.Decimal(m.pricePerMonth),
        sortOrder: m.sortOrder,
      },
    });
  }
}
