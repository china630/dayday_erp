import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AccessControlModule } from "../access/access-control.module";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SystemConfigModule } from "../system-config/system-config.module";
import { BillingPublicController } from "./billing-public.controller";
import { BillingWebhooksController } from "./billing-webhooks.controller";
import { BillingController } from "./billing.controller";
import { BillingPaymentOrdersService } from "./billing-payment-orders.service";
import { BillingPlatformService } from "./billing-platform.service";
import { BillingService } from "./billing.service";
import { BillingMonthlyQueueService } from "./billing-monthly.queue";
import { BillingMonthlyWorker } from "./billing-monthly.worker";
import { BillingMonthlyService } from "./billing-monthly.service";
import { BillingToggleService } from "./billing-toggle.service";
import { OrganizationModuleService } from "./organization-module.service";
import { PaymentProviderService } from "./payment-provider.service";
import { PashaBankPaymentProvider } from "./providers/pasha-bank-payment.provider";

@Module({
  imports: [
    PrismaModule,
    SystemConfigModule,
    AccessControlModule,
    AdminModule,
    AuditModule,
  ],
  controllers: [BillingController, BillingPublicController, BillingWebhooksController],
  providers: [
    BillingService,
    BillingPlatformService,
    BillingPaymentOrdersService,
    OrganizationModuleService,
    PaymentProviderService,
    PashaBankPaymentProvider,
    BillingToggleService,
    BillingMonthlyService,
    BillingMonthlyQueueService,
    BillingMonthlyWorker,
  ],
  exports: [BillingService, BillingPlatformService, PaymentProviderService],
})
export class BillingModule {}
