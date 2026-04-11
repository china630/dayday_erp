import { Module } from "@nestjs/common";
import { RolesGuard } from "../auth/guards/roles.guard";
import { FinanceModule } from "../finance/finance.module";
import { FixedAssetsModule } from "../fixed-assets/fixed-assets.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportingController } from "./reporting.controller";
import { ReportingService } from "./reporting.service";
import { ETaxesIntegrationService } from "./etaxes-integration.service";
import { VatAppendixExportService } from "./vat-appendix-export.service";
import { VatQuarterDataService } from "./vat-quarter-data.service";

@Module({
  imports: [PrismaModule, FixedAssetsModule, FinanceModule],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    VatQuarterDataService,
    VatAppendixExportService,
    ETaxesIntegrationService,
    RolesGuard,
  ],
  exports: [ReportingService],
})
export class ReportingModule {}
