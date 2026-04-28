import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { SubscriptionTier } from "@dayday/database";
import { AccessControlService } from "../access/access-control.service";
import { PricingService } from "../admin/pricing.service";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionAccessService } from "../subscription/subscription-access.service";
import { OrganizationModuleService } from "./organization-module.service";
import {
  catalogModuleKeyToPatch,
  hasConstructorModulesInCustomConfig,
  isCatalogModuleActive,
} from "./billing-module-toggle.helpers";
import type { ToggleModuleDto } from "./dto/toggle-module.dto";

@Injectable()
export class BillingToggleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly subscriptionAccess: SubscriptionAccessService,
    private readonly pricing: PricingService,
    private readonly orgModules: OrganizationModuleService,
  ) {}

  async toggle(
    userId: string,
    organizationId: string,
    dto: ToggleModuleDto,
  ): Promise<{
    organizationId: string;
    moduleKey: string;
    enabled: boolean;
    activeModules: string[];
    proRataAzn: string;
    orderId: string | null;
    paymentUrl: string | null;
    providerMode: string | null;
    skipped: boolean;
    requiresPayment: boolean;
    note?: string;
  }> {
    await this.access.assertOwnerForBilling(userId, organizationId);
    await this.pricing.ensurePricingModulesFromDatabase();

    const row = await this.prisma.pricingModule.findUnique({
      where: { key: dto.moduleKey },
    });
    if (!row) {
      throw new BadRequestException({
        code: "UNKNOWN_MODULE",
        message: "Module key is not in the pricing catalog (pricing_modules).",
      });
    }

    const snap = await this.subscriptionAccess.getOrganizationSnapshot(
      organizationId,
    );

    if (snap.tier === SubscriptionTier.ENTERPRISE) {
      throw new BadRequestException({
        code: "ENTERPRISE_ALL_MODULES",
        message: "Enterprise includes all modules; toggle is not applicable.",
      });
    }

    if (hasConstructorModulesInCustomConfig(snap.customConfig)) {
      throw new BadRequestException({
        code: "CUSTOM_PLAN_MODULES",
        message:
          "This organization uses a custom constructor plan; change modules via admin.",
      });
    }

    const om = await this.prisma.organizationModule.findUnique({
      where: {
        organizationId_moduleKey: {
          organizationId,
          moduleKey: dto.moduleKey,
        },
      },
    });

    const now = new Date();
    const inCatalog = isCatalogModuleActive(snap.activeModules, dto.moduleKey);
    const scheduledCancel =
      om?.cancelledAt != null &&
      om.accessUntil != null &&
      now.getTime() <= om.accessUntil.getTime();
    const fullyActive =
      inCatalog && (om == null || om.cancelledAt == null);

    if (dto.enabled) {
      if (fullyActive) {
        return {
          organizationId,
          moduleKey: dto.moduleKey,
          enabled: true,
          activeModules: snap.activeModules,
          proRataAzn: "0.00",
          orderId: null,
          paymentUrl: null,
          providerMode: null,
          skipped: true,
          requiresPayment: false,
        };
      }

      if (scheduledCancel && om) {
        await this.prisma.$transaction(async (tx) => {
          await tx.organizationModule.update({
            where: {
              organizationId_moduleKey: {
                organizationId,
                moduleKey: dto.moduleKey,
              },
            },
            data: {
              cancelledAt: null,
              accessUntil: null,
            },
          });
        });
        const after = await this.subscriptionAccess.getOrganizationSnapshot(
          organizationId,
        );
        return {
          organizationId,
          moduleKey: dto.moduleKey,
          enabled: true,
          activeModules: after.activeModules,
          proRataAzn: "0.00",
          orderId: null,
          paymentUrl: null,
          providerMode: null,
          skipped: false,
          requiresPayment: false,
          note: "reactivated_before_period_end",
        };
      }

      // Post-paid pivot: module activation is zero-friction (no immediate charge/pro-rata).
      const { activeModules } = await this.prisma.$transaction(async (tx) => {
        const u = await this.subscriptionAccess.updateModuleAddons(
          organizationId,
          catalogModuleKeyToPatch(dto.moduleKey, true),
          tx,
        );
        await this.orgModules.upsertActiveInTx(
          tx,
          organizationId,
          dto.moduleKey,
          row.pricePerMonth,
        );
        return u;
      });
      return {
        organizationId,
        moduleKey: dto.moduleKey,
        enabled: true,
        activeModules,
        proRataAzn: "0.00",
        orderId: null,
        paymentUrl: null,
        providerMode: null,
        skipped: false,
        requiresPayment: false,
        note: "postpaid_activation_without_immediate_payment",
      };
    } else {
      if (!inCatalog && !scheduledCancel) {
        return {
          organizationId,
          moduleKey: dto.moduleKey,
          enabled: false,
          activeModules: snap.activeModules,
          proRataAzn: "0.00",
          orderId: null,
          paymentUrl: null,
          providerMode: null,
          skipped: true,
          requiresPayment: false,
        };
      }
      if (scheduledCancel) {
        return {
          organizationId,
          moduleKey: dto.moduleKey,
          enabled: false,
          activeModules: snap.activeModules,
          proRataAzn: "0.00",
          orderId: null,
          paymentUrl: null,
          providerMode: null,
          skipped: true,
          requiresPayment: false,
        };
      }

      await this.prisma.$transaction(async (tx) => {
        await this.orgModules.scheduleCancellationInTx(
          tx,
          organizationId,
          dto.moduleKey,
          row.pricePerMonth,
        );
      });
      const after = await this.subscriptionAccess.getOrganizationSnapshot(
        organizationId,
      );
      return {
        organizationId,
        moduleKey: dto.moduleKey,
        enabled: false,
        activeModules: after.activeModules,
        proRataAzn: "0.00",
        orderId: null,
        paymentUrl: null,
        providerMode: null,
        skipped: false,
        requiresPayment: false,
        note: "cancellation_scheduled_end_of_month",
      };
    }
  }
}
