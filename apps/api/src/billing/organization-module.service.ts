import { Injectable, Logger } from "@nestjs/common";
import { Decimal, Prisma } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionAccessService } from "../subscription/subscription-access.service";
import { catalogModuleKeyToPatch } from "./billing-module-toggle.helpers";

/** Last instant of the given UTC month (for module access until end of billing period). */
export function endOfUtcMonth(now = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
}

@Injectable()
export class OrganizationModuleService {
  private readonly logger = new Logger(OrganizationModuleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  async upsertActiveInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    moduleKey: string,
    pricePerMonth: Decimal,
  ): Promise<void> {
    await tx.organizationModule.upsert({
      where: {
        organizationId_moduleKey: { organizationId, moduleKey },
      },
      create: {
        organizationId,
        moduleKey,
        priceSnapshot: pricePerMonth,
        cancelledAt: null,
        accessUntil: null,
      },
      update: {
        priceSnapshot: pricePerMonth,
        cancelledAt: null,
        accessUntil: null,
        activatedAt: new Date(),
      },
    });
  }

  /**
   * User disabled module: keep subscription access until end of current UTC month (TZ §14.8.6).
   * Does not remove slugs from `activeModules` — call `finalizeExpiredModuleCancellations` monthly.
   */
  async scheduleCancellationInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    moduleKey: string,
    pricePerMonth: Decimal,
  ): Promise<void> {
    const accessUntil = endOfUtcMonth(new Date());
    await tx.organizationModule.upsert({
      where: {
        organizationId_moduleKey: { organizationId, moduleKey },
      },
      create: {
        organizationId,
        moduleKey,
        priceSnapshot: pricePerMonth,
        cancelledAt: new Date(),
        accessUntil,
      },
      update: {
        cancelledAt: new Date(),
        accessUntil,
      },
    });
  }

  /**
   * After `accessUntil`, remove module from subscription arrays and delete row.
   */
  async finalizeExpiredModuleCancellations(now = new Date()): Promise<number> {
    const expired = await this.prisma.organizationModule.findMany({
      where: {
        cancelledAt: { not: null },
        accessUntil: { lt: now },
      },
    });
    let n = 0;
    for (const row of expired) {
      await this.prisma.$transaction(async (tx) => {
        await this.subscriptionAccess.updateModuleAddons(
          row.organizationId,
          catalogModuleKeyToPatch(row.moduleKey, false),
          tx,
        );
        await tx.organizationModule.delete({
          where: {
            organizationId_moduleKey: {
              organizationId: row.organizationId,
              moduleKey: row.moduleKey,
            },
          },
        });
      });
      n++;
    }
    if (n > 0) {
      this.logger.log(
        `Finalized ${n} expired module cancellation(s) (organization_modules)`,
      );
    }
    return n;
  }
}
