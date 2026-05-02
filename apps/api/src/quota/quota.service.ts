import { Injectable, Logger } from "@nestjs/common";
import { SubscriptionTier } from "@dayday/database";
import { resolveOrganizationUuid } from "../common/organization-id.util";
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
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  private async getTier(organizationId: string): Promise<SubscriptionTier> {
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId) {
      this.logger.warn(
        `getTier: unresolved organizationId="${organizationId}" — using STARTER quotas`,
      );
      return SubscriptionTier.STARTER;
    }
    const sub = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId: orgId },
      select: { tier: true },
    });
    if (!sub) {
      this.logger.warn(
        `getTier: no OrganizationSubscription row for org ${orgId} — using STARTER quotas (dev / lazy billing)`,
      );
      return SubscriptionTier.STARTER;
    }
    return sub.tier;
  }

  private async quotasForTier(tier: SubscriptionTier) {
    return this.systemConfig.getTierQuotas(tier);
  }

  async assertEmployeeQuota(organizationId: string): Promise<void> {
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId) {
      return;
    }
    const tier = await this.getTier(organizationId);
    const { maxEmployees } = await this.quotasForTier(tier);
    if (maxEmployees == null) return;

    const current = await this.prisma.employee.count({
      where: { organizationId: orgId },
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

  async assertStorageQuota(
    organizationId: string,
    additionalBytes: number,
  ): Promise<void> {
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId) {
      return;
    }
    if (additionalBytes <= 0) {
      return;
    }
    const tier = await this.getTier(organizationId);
    const { maxStorageGb } = await this.quotasForTier(tier);
    if (maxStorageGb == null) {
      return;
    }
    const maxBytes = BigInt(maxStorageGb) * 1024n ** 3n;
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, isDeleted: false },
      select: { storageUsedBytes: true },
    });
    const used = org?.storageUsedBytes ?? 0n;
    const add = BigInt(additionalBytes);
    if (used + add > maxBytes) {
      const limitGb = maxStorageGb;
      const usedGb = Number(used) / (1024 * 1024 * 1024);
      const usedRounded = Math.round(usedGb * 100) / 100;
      throw new QuotaExceededException("maxStorageGb", limitGb, usedRounded);
    }
  }

  async addStorageUsage(organizationId: string, deltaBytes: number): Promise<void> {
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId || deltaBytes <= 0) {
      return;
    }
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        storageUsedBytes: { increment: BigInt(deltaBytes) },
      },
    });
  }

  async assertInvoiceMonthlyQuota(organizationId: string): Promise<void> {
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId) {
      return;
    }
    const tier = await this.getTier(organizationId);
    const { maxInvoicesPerMonth } = await this.quotasForTier(tier);
    if (maxInvoicesPerMonth == null) return;

    const { from, to } = utcMonthBoundsUtc();
    const current = await this.prisma.invoice.count({
      where: {
        organizationId: orgId,
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
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId) {
      return { current: 0, max: null, atLimit: false };
    }

    let tier: SubscriptionTier = SubscriptionTier.STARTER;
    try {
      const sub = await this.prisma.organizationSubscription.findUnique({
        where: { organizationId: orgId },
        select: { tier: true },
      });
      if (sub?.tier != null) {
        tier = sub.tier;
      }
    } catch (e) {
      this.logger.warn(
        `getEmployeeQuotaSnapshot: subscription findUnique failed for ${orgId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const { maxEmployees } = await this.quotasForTier(tier);
    let current = 0;
    try {
      current = await this.prisma.employee.count({
        where: { organizationId: orgId },
      });
    } catch (e) {
      this.logger.warn(
        `getEmployeeQuotaSnapshot: employee count failed for ${orgId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const atLimit = maxEmployees != null && current >= maxEmployees;
    return { current, max: maxEmployees, atLimit };
  }

  /** Инвойсы за текущий UTC-месяц — для UI лимита. */
  async getInvoiceMonthlyQuotaSnapshot(organizationId: string): Promise<{
    current: number;
    max: number | null;
    atLimit: boolean;
  }> {
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId) {
      return { current: 0, max: null, atLimit: false };
    }

    let tier: SubscriptionTier = SubscriptionTier.STARTER;
    try {
      const sub = await this.prisma.organizationSubscription.findUnique({
        where: { organizationId: orgId },
        select: { tier: true },
      });
      if (sub?.tier != null) {
        tier = sub.tier;
      }
    } catch (e) {
      this.logger.warn(
        `getInvoiceMonthlyQuotaSnapshot: subscription findUnique failed for ${orgId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const { maxInvoicesPerMonth } = await this.quotasForTier(tier);
    const { from, to } = utcMonthBoundsUtc();
    let current = 0;
    try {
      current = await this.prisma.invoice.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: from, lte: to },
        },
      });
    } catch (e) {
      this.logger.warn(
        `getInvoiceMonthlyQuotaSnapshot: invoice count failed for ${orgId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const atLimit =
      maxInvoicesPerMonth != null && current >= maxInvoicesPerMonth;
    return { current, max: maxInvoicesPerMonth, atLimit };
  }

  async getStorageQuotaSnapshot(organizationId: string): Promise<{
    currentBytes: string;
    maxGb: number | null;
    atLimit: boolean;
  }> {
    const orgId = resolveOrganizationUuid(organizationId);
    if (!orgId) {
      return { currentBytes: "0", maxGb: null, atLimit: false };
    }
    let tier: SubscriptionTier = SubscriptionTier.STARTER;
    try {
      const sub = await this.prisma.organizationSubscription.findUnique({
        where: { organizationId: orgId },
        select: { tier: true },
      });
      if (sub?.tier != null) {
        tier = sub.tier;
      }
    } catch (e) {
      this.logger.warn(
        `getStorageQuotaSnapshot: subscription findUnique failed for ${orgId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const { maxStorageGb } = await this.quotasForTier(tier);
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, isDeleted: false },
      select: { storageUsedBytes: true },
    });
    const used = org?.storageUsedBytes ?? 0n;
    const maxBytes =
      maxStorageGb != null ? BigInt(maxStorageGb) * 1024n ** 3n : null;
    const atLimit = maxBytes != null && used >= maxBytes;
    return {
      currentBytes: used.toString(),
      maxGb: maxStorageGb,
      atLimit,
    };
  }
}
