import { Injectable, Logger } from "@nestjs/common";
import { Prisma, SubscriptionInvoiceStatus } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { runWithTenantContextAsync } from "../prisma/tenant-context";
import { BillingPlatformService } from "./billing-platform.service";
import { OrganizationModuleService } from "./organization-module.service";

const Decimal = Prisma.Decimal;

function startOfMonthUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

function endOfMonthUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class BillingMonthlyService {
  private readonly logger = new Logger(BillingMonthlyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingPlatform: BillingPlatformService,
    private readonly orgModules: OrganizationModuleService,
  ) {}

  /**
   * Ежемесячное начисление: один счёт (ISSUED) на владельца, строки по организациям.
   * Идемпотентность: не создаём второй счёт с тем же userId + periodStart, если уже есть
   * платформенный счёт без payment order за этот период.
   */
  async runMonthlyBilling(now = new Date()): Promise<void> {
    const periodStart = startOfMonthUtc(now);
    const periodEnd = endOfMonthUtc(now);
    const dateOnly = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    await this.orgModules.finalizeExpiredModuleCancellations(now);

    await runWithTenantContextAsync(
      { organizationId: null, skipTenantFilter: true },
      async () => {
        const cutoff = new Date();
        const orgs = await this.prisma.organization.findMany({
          where: {
            subscription: {
              is: { expiresAt: { gt: cutoff } },
            },
          },
          include: { subscription: true },
        });

        const byOwner = new Map<string, typeof orgs>();
        for (const o of orgs) {
          const ownerId = await this.billingPlatform.resolveOwnerUserId(
            this.prisma,
            o.id,
          );
          if (!ownerId) continue;
          if (!byOwner.has(ownerId)) byOwner.set(ownerId, []);
          byOwner.get(ownerId)!.push(o);
        }

        let created = 0;
        for (const [ownerUserId, list] of byOwner) {
          const dup = await this.prisma.subscriptionInvoice.findFirst({
            where: {
              userId: ownerUserId,
              periodStart,
              paymentOrderId: null,
              status: {
                in: [
                  SubscriptionInvoiceStatus.ISSUED,
                  SubscriptionInvoiceStatus.PAID,
                  SubscriptionInvoiceStatus.OVERDUE,
                ],
              },
            },
          });
          if (dup) continue;

          const items: Array<{
            organizationId: string;
            description: string;
            amount: Prisma.Decimal;
          }> = [];

          for (const o of list) {
            const m = await this.billingPlatform.estimateMonthlyAznForOrganization(
              o.id,
            );
            if (m <= 0) continue;
            items.push({
              organizationId: o.id,
              description: `Monthly subscription — ${o.name} (VÖEN ${o.taxId})`,
              amount: new Decimal(roundMoney2(m)),
            });
          }

          if (items.length === 0) continue;

          const totalDec = items.reduce(
            (s, it) => s.add(it.amount),
            new Decimal(0),
          );

          await this.prisma.subscriptionInvoice.create({
            data: {
              userId: ownerUserId,
              amount: totalDec,
              status: SubscriptionInvoiceStatus.ISSUED,
              date: dateOnly,
              periodStart,
              periodEnd,
              items: {
                create: items.map((it) => ({
                  organizationId: it.organizationId,
                  description: it.description,
                  amount: it.amount,
                })),
              },
            },
          });
          created++;
        }

        this.logger.log(
          `Monthly billing: period ${periodStart.toISOString().slice(0, 10)} — ${created} owner invoice(s), ${orgs.length} org(s) scanned`,
        );
      },
    );
  }
}
