import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportingModule } from "../reporting/reporting.module";
import { TreasuryModule } from "../treasury/treasury.module";
import { BankIntegrationService } from "./bank-integration.service";
import { BankMatchService } from "./bank-match.service";
import { BankDirectSyncQueueService } from "./bank-sync.queue";
import { BankDirectSyncWorker } from "./bank-sync.worker";
import { BankWebhookController } from "./bank-webhook.controller";
import { BankingController } from "./banking.controller";
import { BankingService } from "./banking.service";

@Module({
  imports: [
    PrismaModule,
    AccountingModule,
    InvoicesModule,
    ReportingModule,
    TreasuryModule,
  ],
  controllers: [BankingController, BankWebhookController],
  providers: [
    BankingService,
    BankMatchService,
    BankIntegrationService,
    BankDirectSyncQueueService,
    BankDirectSyncWorker,
  ],
})
export class BankingModule {}
