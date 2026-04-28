import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { AccessControlService } from "../access/access-control.service";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { OrganizationId } from "../common/org-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UserRole } from "@dayday/database";
import { SubscriptionTier } from "@dayday/database";
import { PrismaService } from "../prisma/prisma.service";
import { SystemConfigService } from "../system-config/system-config.service";
import { CheckoutDto } from "./dto/checkout.dto";
import { ToggleModuleDto } from "./dto/toggle-module.dto";
import { PaymentProviderService } from "./payment-provider.service";
import { PricingService } from "../admin/pricing.service";
import { BillingPaymentOrdersService } from "./billing-payment-orders.service";
import { BillingPlatformService } from "./billing-platform.service";
import { BillingToggleService } from "./billing-toggle.service";
import { BillingService } from "./billing.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@Controller("billing")
@UseGuards(RolesGuard)
@Roles(UserRole.OWNER)
export class BillingController {
  constructor(
    private readonly payment: PaymentProviderService,
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly access: AccessControlService,
    private readonly pricing: PricingService,
    private readonly paymentOrders: BillingPaymentOrdersService,
    private readonly billingPlatform: BillingPlatformService,
    private readonly billingToggle: BillingToggleService,
    private readonly billingService: BillingService,
  ) {}

  @Get("summary")
  @ApiOperation({
    summary:
      "Портфель организаций, где пользователь — Owner: оценка помесячно и сумма следующего платежа (TZ §14.8)",
  })
  async billingSummary(@CurrentUser() user: AuthUser) {
    return this.billingPlatform.getSummary(user.userId);
  }

  @Get("invoices")
  @ApiOperation({
    summary:
      "История платформенных счетов (SubscriptionInvoice) на аккаунт владельца; pdfUrl для PDF",
  })
  async billingInvoices(
    @CurrentUser() user: AuthUser,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("pageSize", new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    return this.billingPlatform.listInvoices(user.userId, safePage, safeSize);
  }

  @Get("invoices/:id/pdf")
  @ApiOperation({
    summary: "PDF платформенного счёта (агрегированные строки по организациям)",
  })
  async subscriptionInvoicePdf(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.billingPlatform.buildSubscriptionInvoicePdfBuffer(
      id,
      user.userId,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="subscription-invoice-${id.slice(0, 8)}.pdf"`,
    );
    res.send(buf);
  }

  @Get("catalog")
  @ApiOperation({
    summary:
      "Базовая цена платформы и каталог модулей (AZN/мес.) для экрана подписки",
  })
  async catalog() {
    const data = await this.pricing.getConstructorData();
    return {
      currency: "AZN",
      foundationMonthlyAzn: data.basePrice,
      modules: data.modules.map((m) => ({
        id: m.id,
        key: m.key,
        name: m.name,
        pricePerMonth: m.pricePerMonth,
        sortOrder: m.sortOrder,
      })),
    };
  }

  @Get("module-states")
  @ApiOperation({
    summary:
      "Состояния модулей организации для Marketplace UX (pending deactivation badge)",
  })
  async moduleStates(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
  ) {
    await this.access.assertOwnerForBilling(user.userId, organizationId);
    const rows = await this.prisma.organizationModule.findMany({
      where: { organizationId },
      select: {
        moduleKey: true,
        activatedAt: true,
        pendingDeactivation: true,
      },
    });
    return {
      items: rows.map((r) => ({
        moduleKey: r.moduleKey,
        activatedAt: r.activatedAt.toISOString(),
        pendingDeactivation: r.pendingDeactivation,
      })),
    };
  }

  @Get("payment-orders")
  @ApiOperation({
    summary:
      "История заказов оплаты (сырой реестр); для счетов платформы см. GET /billing/invoices (TZ §14.8)",
  })
  async listPaymentOrders(@CurrentUser() user: AuthUser) {
    return this.paymentOrders.listForOwnerUser(user.userId);
  }

  @Get("plans")
  @ApiOperation({
    summary: "Текущие цены тарифов (AZN/мес.) из SystemConfig",
  })
  async plans() {
    const prices = await this.systemConfig.getAllBillingPrices();
    return { currency: "AZN", prices };
  }

  @Get("upgrade-preview")
  @ApiOperation({
    summary:
      "Preview pro-rata amount for tier upgrade (e.g. STARTER -> ENTERPRISE)",
  })
  async upgradePreview(
    @OrganizationId() organizationId: string,
    @Query("newTier") newTierRaw: string,
  ) {
    const v = String(newTierRaw ?? "").trim().toUpperCase();
    if (
      v !== SubscriptionTier.STARTER &&
      v !== SubscriptionTier.BUSINESS &&
      v !== SubscriptionTier.ENTERPRISE
    ) {
      throw new BadRequestException("Unsupported tier");
    }
    const calc = await this.billingService.calculateUpgradePrice(
      organizationId,
      v as SubscriptionTier,
    );
    return {
      amountToPay: calc.amountAzn.toFixed(2),
      daysRemaining: calc.daysRemaining,
      daysInPeriod: calc.daysInPeriod,
      currentTier: calc.currentTier,
      newTier: calc.newTier,
    };
  }

  @Post("toggle-module")
  @ApiOperation({
    summary:
      "Включить/выключить модуль по каталогу pricing_modules; при включении — immediate post-paid activation (без мгновенной оплаты)",
  })
  async toggleModule(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Body() dto: ToggleModuleDto,
  ) {
    return this.billingToggle.toggle(user.userId, organizationId, dto);
  }

  @Post("checkout")
  @ApiOperation({
    summary: "Создать заказ и получить ссылку на оплату (шлюз или mock)",
  })
  async checkout(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Body() dto: CheckoutDto,
  ) {
    await this.access.assertOwnerForBilling(user.userId, organizationId);
    return this.payment.createOrder(organizationId, dto);
  }

  @Get("orders/:id")
  @ApiOperation({ summary: "Статус заказа оплаты (текущая организация)" })
  async getOrder(
    @CurrentUser() user: AuthUser,
    @OrganizationId() organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.access.assertOwnerForBilling(user.userId, organizationId);
    const o = await this.prisma.paymentOrder.findFirst({
      where: { id, organizationId },
    });
    if (!o) {
      throw new NotFoundException("Payment order not found");
    }
    return {
      id: o.id,
      status: o.status,
      amountAzn: o.amountAzn.toString(),
      currency: o.currency,
      monthsApplied: o.monthsApplied,
      paidAt: o.paidAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    };
  }
}
