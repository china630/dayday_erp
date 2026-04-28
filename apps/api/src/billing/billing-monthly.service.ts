import { Injectable, Logger } from "@nestjs/common";
import {
  BillingStatus,
  Prisma,
  SubscriptionInvoiceStatus,
} from "@dayday/database";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { runWithTenantContextAsync } from "../prisma/tenant-context";
import { BillingPlatformService } from "./billing-platform.service";
import { BillingNotificationService } from "./billing-notification.service";
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

function previousMonthAnchorUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

function billingPeriodLabelUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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
    private readonly billingNotifications: BillingNotificationService,
    private readonly orgModules: OrganizationModuleService,
  ) {}

  /**
   * Ежемесячное начисление (post-paid): один счёт (ISSUED) на владельца, строки по организациям.
   * Идемпотентность: не создаём второй счёт с тем же userId + billingPeriod.
   */
  async runMonthlyBilling(now = new Date()): Promise<void> {
    const previousMonth = previousMonthAnchorUtc(now);
    const periodStart = startOfMonthUtc(previousMonth);
    const periodEnd = endOfMonthUtc(previousMonth);
    const billingPeriod = billingPeriodLabelUtc(previousMonth);
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
              billingPeriod,
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

          const billedOrgIds: string[] = [];
          for (const o of list) {
            const m = await this.estimatePostpaidMonthlyAznForOrganization(
              o.id,
              periodStart,
              periodEnd,
            );
            if (m <= 0) continue;
            items.push({
              organizationId: o.id,
              description: `Post-paid monthly modules — ${o.name} (VÖEN ${o.taxId})`,
              amount: new Decimal(roundMoney2(m)),
            });
            billedOrgIds.push(o.id);
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
              billingPeriod,
              items: {
                create: items.map((it) => ({
                  organizationId: it.organizationId,
                  description: it.description,
                  amount: it.amount,
                })),
              },
            },
          });
          await this.prisma.organization.updateMany({
            where: {
              id: { in: billedOrgIds },
            },
            data: {
              billingStatus: BillingStatus.SOFT_BLOCK,
            },
          });
          created++;
        }

        this.logger.log(
          `Post-paid billing: period ${billingPeriod} — ${created} owner invoice(s), ${orgs.length} org(s) scanned`,
        );

        const deactivated = await this.orgModules.finalizePendingDeactivations();
        if (deactivated > 0) {
          this.logger.log(
            `Post-paid billing cleanup: finalized ${deactivated} pending deactivation module(s)`,
          );
        }
      },
    );
  }

  @Cron("0 0 1 * *")
  async runMonthlyBillingCron(): Promise<void> {
    await this.runMonthlyBilling(new Date());
  }

  @Cron("0 10 25 * *")
  async runBillingReminderCron(): Promise<void> {
    await runWithTenantContextAsync(
      { organizationId: null, skipTenantFilter: true },
      async () => {
        const orgsWithPaidModules = await this.prisma.organizationModule.findMany({
          distinct: ["organizationId"],
          select: { organizationId: true },
        });
        for (const row of orgsWithPaidModules) {
          await this.billingNotifications.notifyUpcomingInvoice(
            row.organizationId,
            new Date(),
          );
        }
        this.logger.log(
          `Billing reminder cron: notified ${orgsWithPaidModules.length} organization(s)`,
        );
      },
    );
  }

  @Cron("0 0 6 * *")
  async runHardBlockEscalationCron(): Promise<void> {
    const previousMonth = previousMonthAnchorUtc(new Date());
    const billingPeriod = billingPeriodLabelUtc(previousMonth);
    await runWithTenantContextAsync(
      { organizationId: null, skipTenantFilter: true },
      async () => {
        const soft = await this.prisma.organization.findMany({
          where: { billingStatus: BillingStatus.SOFT_BLOCK },
          select: { id: true },
        });
        if (soft.length === 0) return;
        const softIds = soft.map((o) => o.id);
        const unpaid = await this.prisma.billingInvoiceItem.findMany({
          where: {
            organizationId: { in: softIds },
            subscriptionInvoice: {
              billingPeriod,
              status: { not: SubscriptionInvoiceStatus.PAID },
            },
          },
          select: { organizationId: true },
          distinct: ["organizationId"],
        });
        const hardIds = unpaid.map((r) => r.organizationId);
        if (hardIds.length === 0) return;
        const upd = await this.prisma.organization.updateMany({
          where: { id: { in: hardIds } },
          data: { billingStatus: BillingStatus.HARD_BLOCK },
        });
        this.logger.log(
          `Billing hard-block cron: period ${billingPeriod}, escalated ${upd.count} organization(s)`,
        );
      },
    );
  }

  private async estimatePostpaidMonthlyAznForOrganization(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const billableModules = await this.prisma.organizationModule.findMany({
      where: {
        organizationId,
        activatedAt: { lt: periodStart }, // First month after activation is free.
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
    const modules = await this.prisma.pricingModule.findMany({
      where: { key: { in: active } },
      select: { pricePerMonth: true },
    });
    return modules.reduce((sum, m) => sum + Number(m.pricePerMonth), 0);
  }
}
