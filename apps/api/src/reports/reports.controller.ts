import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { LedgerType } from "@dayday/database";
import { OrganizationId } from "../common/org-id.decorator";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { CashFlowService } from "./cash-flow.service";
import { FinancialReportService } from "./financial-report.service";

@ApiTags("reports")
@ApiBearerAuth("bearer")
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly cashFlow: CashFlowService,
    private readonly financial: FinancialReportService,
  ) {}

  @Get("cash-flow")
  @ApiOperation({ summary: "Cash Flow (direct method) by CashFlowItem" })
  cashFlowReport(
    @OrganizationId() organizationId: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("cashDeskId") cashDeskId?: string,
    @Query("bankName") bankName?: string,
  ) {
    return this.cashFlow.getDirectCashFlow(organizationId, {
      dateFrom,
      dateTo,
      cashDeskId,
      bankName,
    });
  }

  @Get("balance-sheet")
  @ApiOperation({ summary: "Balance Sheet (management) as of date" })
  balanceSheet(
    @OrganizationId() organizationId: string,
    @Query("asOfDate") asOfDate: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.financial.generateBalanceSheet(
      organizationId,
      asOfDate,
      parseLedgerTypeQuery(ledgerType) ?? LedgerType.NAS,
    );
  }

  @Get("executive-widgets")
  @ApiOperation({
    summary:
      "Executive widgets: cash, AR (211), vendor AP (531), payroll/tax AP (521+523), net profit MTD",
  })
  executiveWidgets(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.financial.executiveWidgets(
      organizationId,
      parseLedgerTypeQuery(ledgerType) ?? LedgerType.NAS,
    );
  }
}

