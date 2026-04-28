/**
 * Billing reconciliation (post-paid): compares expected module charges
 * (from OrganizationModule + PricingModule, same rules as BillingMonthlyService)
 * vs summed BillingInvoiceItem amounts for the billing period — detects freeriders / drift.
 *
 * Usage (from repo root, DATABASE_URL required):
 *   npx tsx scripts/billing-reconciliation.ts
 *   npx tsx scripts/billing-reconciliation.ts --period=2026-04
 */
import { Prisma, SubscriptionInvoiceStatus, SubscriptionTier } from "@prisma/client";
import { createPrismaClient, closePrismaPool } from "../packages/database/prisma/prisma-client";

const Decimal = Prisma.Decimal;

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonthUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}

function previousMonthAnchorUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

function billingPeriodLabelUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parsePeriodArg(): string | null {
  const a = process.argv.find((x) => x.startsWith("--period="));
  if (!a) return null;
  return a.slice("--period=".length).trim();
}

async function expectedModuleChargeAzn(
  prisma: ReturnType<typeof createPrismaClient>,
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const billableModules = await prisma.organizationModule.findMany({
    where: {
      organizationId,
      activatedAt: { lt: periodStart },
      OR: [
        { cancelledAt: null },
        { pendingDeactivation: true },
        { accessUntil: { gte: periodEnd } },
      ],
    },
    select: { moduleKey: true },
  });
  const active = billableModules.map((m) => m.moduleKey);
  if (active.length === 0) return 0;
  const modules = await prisma.pricingModule.findMany({
    where: { key: { in: active } },
    select: { pricePerMonth: true },
  });
  return modules.reduce((sum, m) => sum + Number(m.pricePerMonth), 0);
}

async function invoicedForPeriod(
  prisma: ReturnType<typeof createPrismaClient>,
  organizationId: string,
  billingPeriod: string,
): Promise<number> {
  const items = await prisma.billingInvoiceItem.findMany({
    where: {
      organizationId,
      subscriptionInvoice: {
        billingPeriod,
        status: {
          in: [
            SubscriptionInvoiceStatus.ISSUED,
            SubscriptionInvoiceStatus.PAID,
            SubscriptionInvoiceStatus.OVERDUE,
          ],
        },
      },
    },
    select: { amount: true },
  });
  let s = new Decimal(0);
  for (const it of items) {
    s = s.add(it.amount);
  }
  return Number(s.toFixed(2));
}

async function main() {
  const prisma = createPrismaClient();
  const now = new Date();
  const periodStr = parsePeriodArg();
  const anchor = periodStr
    ? new Date(`${periodStr}-01T12:00:00.000Z`)
    : previousMonthAnchorUtc(now);
  const periodStart = startOfMonthUtc(anchor);
  const periodEnd = endOfMonthUtc(anchor);
  const billingPeriod = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;

  console.log(
    `[billing-reconciliation] period=${billingPeriod} (${periodStart.toISOString().slice(0, 10)}…${periodEnd.toISOString().slice(0, 10)})`,
  );

  const orgs = await prisma.organization.findMany({
    where: {
      subscription: {
        is: {
          tier: { not: SubscriptionTier.ENTERPRISE },
          isTrial: false,
        },
      },
    },
    include: { subscription: true },
  });

  let issues = 0;
  for (const o of orgs) {
    const expected = await expectedModuleChargeAzn(prisma, o.id, periodStart, periodEnd);
    const invoiced = await invoicedForPeriod(prisma, o.id, billingPeriod);
    const diff = Math.abs(expected - invoiced);
    if (expected <= 0) continue;
    if (diff > 0.02) {
      issues++;
      const tag =
        invoiced < 0.01 ? "FREERIDER_OR_MISSING_INVOICE" : "AMOUNT_MISMATCH";
      console.warn(
        `[${tag}] org=${o.id} name=${o.name} taxId=${o.taxId} expected=${expected.toFixed(2)} invoiced=${invoiced.toFixed(2)}`,
      );
    }
  }

  if (issues === 0) {
    console.log(
      `[billing-reconciliation] OK — no mismatches for ${orgs.length} org(s) scanned (non-ENTERPRISE, non-trial).`,
    );
  } else {
    console.error(
      `[billing-reconciliation] FAILED — ${issues} organization(s) with billing drift for ${billingPeriod}.`,
    );
    process.exitCode = 1;
  }

  await prisma.$disconnect();
  await closePrismaPool();
}

main().catch(async (e) => {
  console.error(e);
  await closePrismaPool();
  process.exit(1);
});
