import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { apiEnvFilePaths } from "./load-env-paths";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { AccountingModule } from "./accounting/accounting.module";
import { AccountsModule } from "./accounts/accounts.module";
import { AppController } from "./app.controller";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { SubscriptionReadOnlyGuard } from "./subscription/subscription-read-only.guard";
import { BankingModule } from "./banking/banking.module";
import { CounterpartiesModule } from "./counterparties/counterparties.module";
import { FinanceModule } from "./finance/finance.module";
import { FxModule } from "./fx/fx.module";
import { FixedAssetsModule } from "./fixed-assets/fixed-assets.module";
import { HrModule } from "./hr/hr.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ManufacturingModule } from "./manufacturing/manufacturing.module";
import { MailModule } from "./mail/mail.module";
import { ReportingModule } from "./reporting/reporting.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { KassaModule } from "./kassa/kassa.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SubscriptionModule } from "./subscription/subscription.module";
import { QuotaModule } from "./quota/quota.module";
import { ProductsModule } from "./products/products.module";
import { StorageModule } from "./storage/storage.module";
import { TaxModule } from "./tax/tax.module";
import { BillingModule } from "./billing/billing.module";
import { AdminModule } from "./admin/admin.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { TenantContextInterceptor } from "./prisma/tenant-context.interceptor";
import { TreasuryModule } from "./treasury/treasury.module";
import { ReportsModule } from "./reports/reports.module";

const apiEnvFiles = apiEnvFilePaths();

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: apiEnvFiles.length ? apiEnvFiles : [".env"],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    MailModule,
    PrismaModule,
    SubscriptionModule,
    BillingModule,
    QuotaModule,
    StorageModule,
    AccountingModule,
    FinanceModule,
    AccountsModule,
    CounterpartiesModule,
    ProductsModule,
    InventoryModule,
    FixedAssetsModule,
    ManufacturingModule,
    InvoicesModule,
    BankingModule,
    KassaModule,
    FxModule,
    HrModule,
    ReportingModule,
    TaxModule,
    AuditModule,
    AdminModule,
    OrganizationsModule,
    TreasuryModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionReadOnlyGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
  ],
})
export class AppModule {}
