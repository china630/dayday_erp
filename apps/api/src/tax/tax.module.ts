import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { TaxController } from "./tax.controller";
import { TaxService } from "./tax.service";
import { TaxpayerIntegrationService } from "./taxpayer-integration.service";

@Module({
  imports: [IntegrationsModule, AuditModule],
  controllers: [TaxController],
  providers: [TaxService, TaxpayerIntegrationService],
  exports: [TaxService, TaxpayerIntegrationService],
})
export class TaxModule {}
