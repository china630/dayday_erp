import {
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
import { PrismaService } from "../prisma/prisma.service";
import { SystemConfigService } from "../system-config/system-config.service";
import { CheckoutDto } from "./dto/checkout.dto";
import { ToggleModuleDto } from "./dto/toggle-module.dto";
import { PaymentProviderService } from "./payment-provider.service";
import { PricingService } from "../admin/pricing.service";
import { BillingPaymentOrdersService } from "./billing-payment-orders.service";
import { BillingPlatformService } from "./billing-platform.service";
import { BillingToggleService } from "./billing-toggle.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@Controller("billing")
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

  @Post("toggle-module")
  @ApiOperation({
    summary:
      "Включить/выключить модуль по каталогу pricing_modules; при включении — Pro-rata до конца месяца (заказ с monthsApplied=0)",
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
