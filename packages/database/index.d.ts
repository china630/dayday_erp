export * from "@prisma/client";
export { Prisma } from "@prisma/client";
/** Instance type for `new Decimal(...)` (TS2749 if only `typeof Prisma.Decimal` is exported). */
export type Decimal = InstanceType<typeof Prisma.Decimal>;
export declare const Decimal: typeof Prisma.Decimal;
export {
  chartOfAccountsAzJsonPath,
  loadChartJson,
  loadChartTemplateFromDb,
  seedChartOfAccountsForOrganization,
  syncAzChartForOrganization,
  type ChartAccountSeed,
  type ChartOfAccountsFile,
} from "./dist/chart-seed";
export {
  PRICING_MODULE_SEED_DEFAULTS,
  seedPricingModuleIfEmpty,
  type PricingModuleSeedRow,
} from "./dist/pricing-module-seed";
