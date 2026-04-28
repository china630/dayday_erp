import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AuditModule } from "../audit/audit.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportingModule } from "../reporting/reporting.module";
import { TreasuryModule } from "../treasury/treasury.module";
import { BankIntegrationService } from "./bank-integration.service";
import { BankMatchService } from "./bank-match.service";
import { AbbAdapter } from "./bank-providers/abb.adapter";
import { BirbankAdapter } from "./bank-providers/birbank.adapter";
import { PashaBankAdapter } from "./bank-providers/pasha-bank.adapter";
import { ProviderRegistryService } from "./bank-providers/provider-registry.service";
import { BankBalancesSyncQueueService } from "./bank-balances-sync.queue";
import { BankBalancesSyncWorker } from "./bank-balances-sync.worker";
import { BankDirectSyncQueueService } from "./bank-sync.queue";
import { BankDirectSyncWorker } from "./bank-sync.worker";
import { BankWebhookController } from "./bank-webhook.controller";
import { BankingController } from "./banking.controller";
import { BankingGatewayService } from "./banking-gateway.service";
import { BankingService } from "./banking.service";
import { IbanValidationService } from "./iban-validation.service";
import { UniversalBankExportService } from "./universal-bank-export.service";

@Module({
  imports: [
    PrismaModule,
    IntegrationsModule,
    AuditModule,
    AccountingModule,
    InvoicesModule,
    ReportingModule,
    TreasuryModule,
  ],
  controllers: [BankingController, BankWebhookController],
  providers: [
    BankingService,
    PashaBankAdapter,
    AbbAdapter,
    BirbankAdapter,
    ProviderRegistryService,
    BankingGatewayService,
    UniversalBankExportService,
    IbanValidationService,
    BankMatchService,
    BankIntegrationService,
    BankDirectSyncQueueService,
    BankDirectSyncWorker,
    BankBalancesSyncQueueService,
    BankBalancesSyncWorker,
  ],
  exports: [BankingGatewayService, BankBalancesSyncQueueService],
})
export class BankingModule {}
