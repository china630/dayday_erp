import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportingModule } from "../reporting/reporting.module";
import { CashFlowService } from "./cash-flow.service";
import { FinancialReportService } from "./financial-report.service";
import { ReportsCacheService } from "./reports-cache.service";
import { ReportsController } from "./reports.controller";

@Module({
  imports: [PrismaModule, ReportingModule],
  controllers: [ReportsController],
  providers: [ReportsCacheService, CashFlowService, FinancialReportService],
})
export class ReportsModule {}

