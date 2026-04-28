import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { LedgerType, UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReportingService } from "../reporting/reporting.service";
import { CashFlowService } from "./cash-flow.service";
import { FinancialReportService } from "./financial-report.service";
import { cashFlowPdfBuffer, cashFlowXlsxBuffer } from "./report-export.util";

const RECON_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.USER,
  UserRole.AUDITOR,
  UserRole.WAREHOUSE_KEEPER,
] as const;

@ApiTags("reports")
@ApiBearerAuth("bearer")
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly cashFlow: CashFlowService,
    private readonly financial: FinancialReportService,
    private readonly reporting: ReportingService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Get("cash-flow")
  @UseGuards(RolesGuard)
  @Roles(...RECON_ROLES)
  @ApiOperation({ summary: "Cash Flow (direct method) by CashFlowItem" })
  cashFlowReport(
    @OrganizationId() organizationId: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("cashDeskId") cashDeskId?: string,
    @Query("bankName") bankName?: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.cashFlow.getDirectCashFlow(organizationId, {
      dateFrom,
      dateTo,
      cashDeskId,
      bankName,
      ledgerType: parseLedgerTypeQuery(ledgerType) ?? LedgerType.NAS,
    });
  }

  @Get("cash-flow/export")
  @UseGuards(RolesGuard)
  @Roles(...RECON_ROLES)
  @ApiOperation({ summary: "Cash Flow export to PDF/XLSX" })
  async cashFlowExport(
    @OrganizationId() organizationId: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("format") format: string,
    @Query("cashDeskId") cashDeskId?: string,
    @Query("bankName") bankName?: string,
    @Query("ledgerType") ledgerType?: string,
  ): Promise<StreamableFile> {
    const data = await this.cashFlow.getDirectCashFlow(organizationId, {
      dateFrom,
      dateTo,
      cashDeskId,
      bankName,
      ledgerType: parseLedgerTypeQuery(ledgerType) ?? LedgerType.NAS,
    });
    const fmt = (format ?? "").toLowerCase();
    if (fmt === "xlsx") {
      const buffer = await cashFlowXlsxBuffer(data);
      return new StreamableFile(buffer, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="cash-flow-${dateFrom}-${dateTo}.xlsx"`,
      });
    }
    const buffer = await cashFlowPdfBuffer(data);
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="cash-flow-${dateFrom}-${dateTo}.pdf"`,
    });
  }

  @Get("balance-sheet")
  @UseGuards(RolesGuard)
  @Roles(...RECON_ROLES)
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
  @UseGuards(RolesGuard)
  @Roles(...RECON_ROLES)
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

  @Get("reconciliation/:counterpartyId")
  @UseGuards(RolesGuard)
  @Roles(...RECON_ROLES)
  @ApiOperation({
    summary:
      "Акт сверки взаиморасчётов (Üzləşmə aktı): сальдо, проводки журнала, обороты за период",
  })
  reconciliationAct(
    @OrganizationId() organizationId: string,
    @Param("counterpartyId") counterpartyId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("currency") currency?: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    const from = dateFrom ?? startDate;
    const to = dateTo ?? endDate;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        "startDate and endDate (or dateFrom/dateTo) are required (YYYY-MM-DD)",
      );
    }
    return this.reporting.counterpartyReconciliation(
      organizationId,
      counterpartyId,
      from.trim(),
      to.trim(),
      {
        currency: currency ?? null,
        ledgerType: parseLedgerTypeQuery(ledgerType) ?? undefined,
      },
    );
  }

  @Get("reconciliation/:counterpartyId/pdf")
  @UseGuards(RolesGuard)
  @Roles(...RECON_ROLES)
  @ApiOperation({ summary: "PDF акта сверки (AZ)" })
  async reconciliationActPdf(
    @OrganizationId() organizationId: string,
    @Param("counterpartyId") counterpartyId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("currency") currency?: string,
    @Query("ledgerType") ledgerType?: string,
  ): Promise<StreamableFile> {
    const from = dateFrom ?? startDate;
    const to = dateTo ?? endDate;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        "startDate and endDate (or dateFrom/dateTo) are required (YYYY-MM-DD)",
      );
    }
    const { buffer, filename } = await this.reporting.counterpartyReconciliationPdf(
      organizationId,
      counterpartyId,
      from.trim(),
      to.trim(),
      {
        currency: currency ?? null,
        ledgerType: parseLedgerTypeQuery(ledgerType) ?? undefined,
      },
    );
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get("reconciliation/:counterpartyId/xlsx")
  @UseGuards(RolesGuard)
  @Roles(...RECON_ROLES)
  @ApiOperation({ summary: "Excel: акт сверки (строки журнала и сальдо)" })
  async reconciliationActXlsx(
    @OrganizationId() organizationId: string,
    @Param("counterpartyId") counterpartyId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("currency") currency?: string,
    @Query("ledgerType") ledgerType?: string,
  ): Promise<StreamableFile> {
    const from = dateFrom ?? startDate;
    const to = dateTo ?? endDate;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        "startDate and endDate (or dateFrom/dateTo) are required (YYYY-MM-DD)",
      );
    }
    const { buffer, filename } = await this.reporting.counterpartyReconciliationXlsx(
      organizationId,
      counterpartyId,
      from.trim(),
      to.trim(),
      {
        currency: currency ?? null,
        ledgerType: parseLedgerTypeQuery(ledgerType) ?? undefined,
      },
    );
    return new StreamableFile(buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post("reconciliation/:counterpartyId/email")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Отправить PDF акта сверки на email контрагента (если указан и настроен SMTP)",
  })
  async emailReconciliationAct(
    @OrganizationId() organizationId: string,
    @Param("counterpartyId") counterpartyId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("currency") currency?: string,
    @Query("ledgerType") ledgerType?: string,
  ): Promise<{ ok: boolean; sentTo: string }> {
    const from = dateFrom ?? startDate;
    const to = dateTo ?? endDate;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        "startDate and endDate (or dateFrom/dateTo) are required (YYYY-MM-DD)",
      );
    }
    const cp = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, organizationId },
    });
    if (!cp) {
      throw new NotFoundException("Counterparty not found");
    }
    const email = cp.email?.trim();
    if (!email) {
      throw new BadRequestException("У контрагента не указан email");
    }
    if (!this.mail.isConfigured()) {
      throw new BadRequestException("SMTP не настроен (SMTP_HOST)");
    }
    const { buffer, filename } = await this.reporting.counterpartyReconciliationPdf(
      organizationId,
      counterpartyId,
      from.trim(),
      to.trim(),
      {
        currency: currency ?? null,
        ledgerType: parseLedgerTypeQuery(ledgerType) ?? undefined,
      },
    );
    await this.mail.sendMail({
      to: email,
      subject: `Акт сверки ${cp.name} (${from} — ${to})`,
      text: `Во вложении акт сверки взаиморасчётов за период ${from} — ${to}.`,
      attachments: [
        {
          filename,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });
    return { ok: true, sentTo: email };
  }
}
