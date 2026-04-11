import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

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
}
