import { Injectable, NotFoundException } from "@nestjs/common";
import { SubscriptionTier } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { SystemConfigService } from "../system-config/system-config.service";
import { QuotaExceededException } from "./quota-exceeded.exception";

const TIER_RANK: Record<SubscriptionTier, number> = {
  [SubscriptionTier.STARTER]: 0,
  [SubscriptionTier.BUSINESS]: 1,
  [SubscriptionTier.ENTERPRISE]: 2,
};

function pickHighestTier(tiers: SubscriptionTier[]): SubscriptionTier {
  if (tiers.length === 0) return SubscriptionTier.STARTER;
  return tiers.reduce((best, t) =>
    TIER_RANK[t] > TIER_RANK[best] ? t : best,
  );
}

function utcMonthBoundsUtc(now = new Date()): { from: Date; to: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { from, to };
}

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  private async getTier(organizationId: string): Promise<SubscriptionTier> {
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: { tier: true },
    });
    if (!sub) {
      throw new NotFoundException("Organization subscription not found");
    }
    return sub.tier;
  }

  private async quotasForTier(tier: SubscriptionTier) {
    return this.systemConfig.getTierQuotas(tier);
  }

  async assertEmployeeQuota(organizationId: string): Promise<void> {
    const tier = await this.getTier(organizationId);
    const { maxEmployees } = await this.quotasForTier(tier);
    if (maxEmployees == null) return;

    const current = await this.prisma.employee.count({
      where: { organizationId },
    });
    if (current >= maxEmployees) {
      throw new QuotaExceededException("maxEmployees", maxEmployees, current);
    }
  }

  /**
   * Лимит числа организаций на пользователя по эффективному тиру (максимальный тир среди членств).
   */
  async assertOrganizationsPerUserMembershipLimit(
    userId: string,
  ): Promise<void> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId },
      select: {
        organization: {
          select: { subscription: { select: { tier: true } } },
        },
      },
    });
    const current = memberships.length;
    /** Нет строки subscription (миграции / lazy create) — не считать «пустой» тир как STARTER (maxOrganizations=1). */
    const tiers = memberships.map((m) => {
      const t = m.organization.subscription?.tier;
      return t ?? SubscriptionTier.BUSINESS;
    });
    const effectiveTier = pickHighestTier(tiers);
    const { maxOrganizations } = await this.quotasForTier(effectiveTier);
    if (maxOrganizations == null) return;
    if (current >= maxOrganizations) {
      throw new QuotaExceededException(
        "maxOrganizations",
        maxOrganizations,
        current,
      );
    }
  }

  async assertInvoiceMonthlyQuota(organizationId: string): Promise<void> {
    const tier = await this.getTier(organizationId);
    const { maxInvoicesPerMonth } = await this.quotasForTier(tier);
    if (maxInvoicesPerMonth == null) return;

    const { from, to } = utcMonthBoundsUtc();
    const current = await this.prisma.invoice.count({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
      },
    });
    if (current >= maxInvoicesPerMonth) {
      throw new QuotaExceededException(
        "maxInvoicesPerMonth",
        maxInvoicesPerMonth,
        current,
      );
    }
  }

  /** Для UI: текущее число сотрудников и лимит по тиру (без исключения при достижении лимита). */
  async getEmployeeQuotaSnapshot(organizationId: string): Promise<{
    current: number;
    max: number | null;
    atLimit: boolean;
  }> {
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: { tier: true },
    });
    if (!sub) {
      throw new NotFoundException("Organization subscription not found");
    }
    const { maxEmployees } = await this.quotasForTier(sub.tier);
    const current = await this.prisma.employee.count({
      where: { organizationId },
    });
    const atLimit =
      maxEmployees != null && current >= maxEmployees;
    return { current, max: maxEmployees, atLimit };
  }

  /** Инвойсы за текущий UTC-месяц — для UI лимита. */
  async getInvoiceMonthlyQuotaSnapshot(organizationId: string): Promise<{
    current: number;
    max: number | null;
    atLimit: boolean;
  }> {
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: { tier: true },
    });
    if (!sub) {
      throw new NotFoundException("Organization subscription not found");
    }
    const { maxInvoicesPerMonth } = await this.quotasForTier(sub.tier);
    const { from, to } = utcMonthBoundsUtc();
    const current = await this.prisma.invoice.count({
      where: {
        organizationId,
        createdAt: { gte: from, lte: to },
      },
    });
    const atLimit =
      maxInvoicesPerMonth != null && current >= maxInvoicesPerMonth;
    return { current, max: maxInvoicesPerMonth, atLimit };
  }
}
