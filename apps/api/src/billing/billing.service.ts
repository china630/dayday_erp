import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SubscriptionTier } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { SystemConfigService } from "../system-config/system-config.service";

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  /**
   * Продлевает подписку на N календарных месяцев от max(сейчас, expiresAt).
   */
  async extendSubscriptionByMonths(
    organizationId: string,
    months: number,
    tx?: Prisma.TransactionClient,
    options?: { clearTrial?: boolean },
  ): Promise<{ expiresAt: Date }> {
    const db = tx ?? this.prisma;
    const sub = await db.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!sub) {
      throw new NotFoundException("Organization subscription not found");
    }
    const now = new Date();
    const base =
      sub.expiresAt && sub.expiresAt.getTime() > now.getTime()
        ? sub.expiresAt
        : now;
    const next = new Date(base.getTime());
    next.setUTCMonth(next.getUTCMonth() + months);
    await db.organizationSubscription.update({
      where: { organizationId },
      data: {
        expiresAt: next,
        ...(options?.clearTrial ? { isTrial: false } : {}),
      },
    });
    return { expiresAt: next };
  }

  /**
   * Мок без платёжного шлюза: +1 месяц (для dev / тестов).
   */
  async mockExtendOneMonth(organizationId: string): Promise<{
    ok: true;
    expiresAt: string;
  }> {
    const { expiresAt } = await this.extendSubscriptionByMonths(
      organizationId,
      1,
      undefined,
      { clearTrial: true },
    );
    return { ok: true, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Pro-rata upgrade policy (M14.8.6):
   * (newTierPrice - currentTierPrice) * (daysRemaining / daysInPeriod)
   * rounded to 2 decimals AZN.
   */
  async calculateUpgradePrice(
    organizationId: string,
    newTier: SubscriptionTier,
  ): Promise<{
    amountAzn: number;
    daysRemaining: number;
    daysInPeriod: number;
    currentTier: SubscriptionTier;
    newTier: SubscriptionTier;
  }> {
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: { tier: true, expiresAt: true },
    });
    if (!sub) {
      throw new NotFoundException("Organization subscription not found");
    }

    const now = new Date();
    const periodEnd =
      sub.expiresAt && sub.expiresAt.getTime() > now.getTime() ? sub.expiresAt : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const periodStart = new Date(periodEnd.getTime());
    periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);

    const dayMs = 24 * 60 * 60 * 1000;
    const daysRemaining = Math.max(1, Math.ceil((periodEnd.getTime() - now.getTime()) / dayMs));
    const daysInPeriod = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / dayMs));

    const currentPrice = await this.systemConfig.getBillingPriceAzn(sub.tier);
    const newPrice = await this.systemConfig.getBillingPriceAzn(newTier);
    const diff = Math.max(0, newPrice - currentPrice);
    const amountAzn = Math.round((diff * (daysRemaining / daysInPeriod)) * 100) / 100;

    return {
      amountAzn,
      daysRemaining,
      daysInPeriod,
      currentTier: sub.tier,
      newTier,
    };
  }
}
