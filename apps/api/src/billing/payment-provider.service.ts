import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Decimal,
  PaymentOrderStatus,
  Prisma,
  SubscriptionTier,
} from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";
import { SystemConfigService } from "../system-config/system-config.service";
import { SubscriptionAccessService } from "../subscription/subscription-access.service";
import type { CheckoutDto } from "./dto/checkout.dto";
import type { PaymentWebhookDto } from "./dto/payment-webhook.dto";
import { PashaBankPaymentProvider } from "./providers/pasha-bank-payment.provider";
import { BillingPlatformService } from "./billing-platform.service";
import {
  catalogModuleKeyToPatch,
  parseToggleModuleMetadata,
  TOGGLE_MODULE_META_PURPOSE,
} from "./billing-module-toggle.helpers";
import { OrganizationModuleService } from "./organization-module.service";

@Injectable()
export class PaymentProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly billingPlatform: BillingPlatformService,
    private readonly subscriptionAccess: SubscriptionAccessService,
    private readonly orgModules: OrganizationModuleService,
    private readonly pasha: PashaBankPaymentProvider,
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  /**
   * Создаёт заказ и возвращает URL оплаты (PAŞA Bank или mock-редирект).
   */
  async createOrder(
    organizationId: string,
    dto: CheckoutDto,
  ): Promise<{ orderId: string; paymentUrl: string; providerMode: string }> {
    const months = dto.months ?? 1;

    const amountAzn =
      dto.tier != null
        ? await this.systemConfig.getBillingPriceAzn(dto.tier as SubscriptionTier)
        : dto.amountAzn;

    const webApp = this.config
      .get<string>("WEB_APP_PUBLIC_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    const apiPublic = this.config
      .get<string>("API_PUBLIC_URL", "http://127.0.0.1:4000")
      .replace(/\/$/, "");

    const order = await this.prisma.paymentOrder.create({
      data: {
        organizationId,
        amountAzn: new Decimal(amountAzn),
        monthsApplied: months,
        description: `Subscription renewal (${months} mo.)`,
        idempotencyKey: dto.idempotencyKey ?? null,
        status: PaymentOrderStatus.PENDING,
        provider: "pasha_bank",
        metadata: {},
      },
    });

    const returnUrl = `${webApp}/billing/success?orderId=${encodeURIComponent(order.id)}`;
    const callbackUrl = `${apiPublic}/api/public/billing/webhook`;

    const session = await this.pasha.createPaymentSession({
      internalOrderId: order.id,
      organizationId,
      amount: amountAzn,
      currency: "AZN",
      description: order.description,
      returnUrl,
      callbackUrl,
    });

    const provider =
      session.providerMode === "mock" ? "mock" : "pasha_bank";
    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        provider,
        providerTxnId: session.externalId ?? null,
        metadata: {
          lastPaymentUrl: session.paymentUrl,
          providerMode: session.providerMode,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      orderId: order.id,
      paymentUrl: session.paymentUrl,
      providerMode: session.providerMode,
    };
  }

  /**
   * Заказ Pro-rata за включение модуля до конца текущего месяца (`monthsApplied: 0`).
   * После оплаты модуль включается в `finalizePaidOrder` по metadata.
   */
  async createProRataModuleOrder(
    organizationId: string,
    amountAzn: number,
    moduleKey: string,
  ): Promise<{ orderId: string; paymentUrl: string; providerMode: string }> {
    const webApp = this.config
      .get<string>("WEB_APP_PUBLIC_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    const apiPublic = this.config
      .get<string>("API_PUBLIC_URL", "http://127.0.0.1:4000")
      .replace(/\/$/, "");

    const order = await this.prisma.paymentOrder.create({
      data: {
        organizationId,
        amountAzn: new Decimal(amountAzn),
        monthsApplied: 0,
        description: `Pro-rata: enable module ${moduleKey} until month end`,
        idempotencyKey: null,
        status: PaymentOrderStatus.PENDING,
        provider: "pasha_bank",
        metadata: {
          purpose: TOGGLE_MODULE_META_PURPOSE,
          moduleKey,
          enabled: true,
        } as Prisma.InputJsonValue,
      },
    });

    const returnUrl = `${webApp}/billing/success?orderId=${encodeURIComponent(order.id)}`;
    const callbackUrl = `${apiPublic}/api/public/billing/webhook`;

    const session = await this.pasha.createPaymentSession({
      internalOrderId: order.id,
      organizationId,
      amount: amountAzn,
      currency: "AZN",
      description: order.description,
      returnUrl,
      callbackUrl,
    });

    const provider =
      session.providerMode === "mock" ? "mock" : "pasha_bank";
    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        provider,
        providerTxnId: session.externalId ?? null,
        metadata: {
          purpose: TOGGLE_MODULE_META_PURPOSE,
          moduleKey,
          enabled: true,
          lastPaymentUrl: session.paymentUrl,
          providerMode: session.providerMode,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      orderId: order.id,
      paymentUrl: session.paymentUrl,
      providerMode: session.providerMode,
    };
  }

  /** Mock-pay: фиксируем оплату и продлеваем подписку. */
  async confirmPaymentOrder(orderId: string, mockToken: string): Promise<void> {
    if (!this.pasha.verifyOrderToken(orderId, mockToken)) {
      throw new UnauthorizedException("Invalid payment token");
    }
    await this.finalizePaidOrder(orderId);
  }

  async handleWebhook(dto: PaymentWebhookDto): Promise<{ ok: boolean }> {
    if (
      !this.pasha.verifyWebhookSignature(
        dto.orderId,
        dto.status,
        dto.signature,
      )
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    if (dto.status === "failed") {
      await this.prisma.paymentOrder.updateMany({
        where: {
          id: dto.orderId,
          status: PaymentOrderStatus.PENDING,
        },
        data: { status: PaymentOrderStatus.FAILED },
      });
      return { ok: true };
    }

    if (dto.externalId) {
      await this.prisma.paymentOrder.updateMany({
        where: { id: dto.orderId, status: PaymentOrderStatus.PENDING },
        data: { providerTxnId: dto.externalId },
      });
    }

    await this.finalizePaidOrder(dto.orderId);
    return { ok: true };
  }

  /**
   * TZ §14.8 / v12.7: сначала проверяем владельца для платформенного счёта, затем PAID → продление → SubscriptionInvoice + BillingInvoiceItem.
   */
  private async finalizePaidOrder(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.paymentOrder.findUnique({
        where: { id: orderId },
        include: { organization: true },
      });
      if (!current) {
        throw new BadRequestException("Payment order not found");
      }

      if (current.status === PaymentOrderStatus.PAID) {
        await this.billingPlatform.recordPaidOrderInvoice(tx, orderId);
        return;
      }

      if (current.status !== PaymentOrderStatus.PENDING) {
        throw new BadRequestException("Payment order cannot be completed");
      }

      const ownerUserId = await this.billingPlatform.resolveOwnerUserId(
        tx,
        current.organizationId,
      );
      if (!ownerUserId) {
        throw new BadRequestException({
          code: "BILLING_OWNER_REQUIRED",
          message:
            "Cannot finalize payment: organization has no billable owner for platform billing.",
        });
      }

      await tx.paymentOrder.update({
        where: { id: orderId },
        data: {
          status: PaymentOrderStatus.PAID,
          paidAt: new Date(),
        },
      });

      const toggleMeta = parseToggleModuleMetadata(current.metadata);
      if (
        toggleMeta?.enabled === true &&
        current.monthsApplied === 0 &&
        toggleMeta.moduleKey
      ) {
        await this.subscriptionAccess.updateModuleAddons(
          current.organizationId,
          catalogModuleKeyToPatch(toggleMeta.moduleKey, true),
          tx,
        );
        const pm = await tx.pricingModule.findUnique({
          where: { key: toggleMeta.moduleKey },
        });
        if (pm) {
          await this.orgModules.upsertActiveInTx(
            tx,
            current.organizationId,
            toggleMeta.moduleKey,
            pm.pricePerMonth,
          );
        }
      } else if (current.monthsApplied > 0) {
        await this.billing.extendSubscriptionByMonths(
          current.organizationId,
          current.monthsApplied,
          tx,
          { clearTrial: true },
        );
      }

      await this.billingPlatform.recordPaidOrderInvoice(tx, orderId);
    });
  }
}
