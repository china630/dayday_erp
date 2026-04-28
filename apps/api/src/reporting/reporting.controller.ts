import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@dayday/database";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { FinanceService } from "../finance/finance.service";
import { ClosePeriodDto } from "./dto/close-period.dto";
import { CreateNettingDto } from "./dto/create-netting.dto";
import { ETaxesIntegrationService } from "./etaxes-integration.service";
import { GenerateTaxDeclarationDto } from "./dto/generate-tax-declaration.dto";
import { ReportingService } from "./reporting.service";
import { TaxExportService } from "./tax-export.service";
import { VatAppendixExportService } from "./vat-appendix-export.service";
import {
  plPdfBuffer,
  plXlsxBuffer,
  trialBalancePdfBuffer,
  trialBalanceXlsxBuffer,
} from "../reports/report-export.util";

@ApiTags("reporting")
@ApiBearerAuth("bearer")
@Controller("reporting")
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly vatAppendix: VatAppendixExportService,
    private readonly etaxes: ETaxesIntegrationService,
    private readonly taxExport: TaxExportService,
    private readonly finance: FinanceService,
  ) {}

  @Get("trial-balance")
  @ApiOperation({ summary: "Оборотно-сальдовая ведомость за период" })
  trialBalance(
    @OrganizationId() organizationId: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.reporting.trialBalance(
      organizationId,
      dateFrom,
      dateTo,
      parseLedgerTypeQuery(ledgerType),
    );
  }

  @Get("trial-balance/export")
  @ApiOperation({ summary: "Export Trial Balance to PDF/XLSX" })
  async trialBalanceExport(
    @OrganizationId() organizationId: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("format") format: string,
    @Query("ledgerType") ledgerType?: string,
  ): Promise<StreamableFile> {
    const data = await this.reporting.trialBalance(
      organizationId,
      dateFrom,
      dateTo,
      parseLedgerTypeQuery(ledgerType),
    );
    const fmt = (format ?? "").toLowerCase();
    if (fmt === "xlsx") {
      const buffer = await trialBalanceXlsxBuffer(data);
      return new StreamableFile(buffer, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="trial-balance-${dateFrom}-${dateTo}.xlsx"`,
      });
    }
    const buffer = await trialBalancePdfBuffer(data);
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="trial-balance-${dateFrom}-${dateTo}.pdf"`,
    });
  }

  @Get("pl")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.USER,
    UserRole.AUDITOR,
    UserRole.WAREHOUSE_KEEPER,
  )
  @ApiOperation({ summary: "P&L по проводкам (начисление)" })
  profitAndLoss(
    @OrganizationId() organizationId: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("ledgerType") ledgerType?: string,
    @Query("departmentId") departmentId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const requestedDepartment = departmentId?.trim();
    const role = user ? requireOrgRole(user) : null;
    if (
      requestedDepartment &&
      role !== UserRole.OWNER &&
      role !== UserRole.ACCOUNTANT
    ) {
      throw new BadRequestException(
        "Department filter is available only for OWNER and ACCOUNTANT",
      );
    }
    return this.reporting.profitAndLoss(
      organizationId,
      dateFrom,
      dateTo,
      parseLedgerTypeQuery(ledgerType),
      requestedDepartment,
    );
  }

  @Get("pl/export")
  @ApiOperation({ summary: "Export Profit&Loss to PDF/XLSX" })
  async profitAndLossExport(
    @OrganizationId() organizationId: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("format") format: string,
    @Query("ledgerType") ledgerType?: string,
    @Query("departmentId") departmentId?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<StreamableFile> {
    const requestedDepartment = departmentId?.trim();
    const role = user ? requireOrgRole(user) : null;
    if (
      requestedDepartment &&
      role !== UserRole.OWNER &&
      role !== UserRole.ACCOUNTANT
    ) {
      throw new BadRequestException(
        "Department filter is available only for OWNER and ACCOUNTANT",
      );
    }
    const data = await this.reporting.profitAndLoss(
      organizationId,
      dateFrom,
      dateTo,
      parseLedgerTypeQuery(ledgerType),
      requestedDepartment,
    );
    const fmt = (format ?? "").toLowerCase();
    if (fmt === "xlsx") {
      const buffer = await plXlsxBuffer(data);
      return new StreamableFile(buffer, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="pl-${dateFrom}-${dateTo}.xlsx"`,
      });
    }
    const buffer = await plPdfBuffer(data);
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="pl-${dateFrom}-${dateTo}.pdf"`,
    });
  }

  @Get("dashboard")
  @ApiOperation({
    summary:
      "Виджеты главной: касса/банк, обязательства 521+531, расходы 721 за месяц, топ товаров, выручка 30 дн.",
  })
  dashboard(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.reporting.dashboard(
      organizationId,
      parseLedgerTypeQuery(ledgerType),
    );
  }

  @Get("period-status")
  @ApiOperation({
    summary: "Статус закрытия текущего UTC-месяца (Maliyyə dövrü / виджет главной)",
  })
  periodStatus(@OrganizationId() organizationId: string) {
    return this.reporting.getPeriodStatus(organizationId);
  }

  @Get("close-period-prompt")
  @ApiOperation({
    summary:
      "Нужно ли показывать блок закрытия месяца: самый ранний незакрытый прошедший UTC-месяц",
  })
  closePeriodPrompt(@OrganizationId() organizationId: string) {
    return this.reporting.getClosePeriodPrompt(organizationId);
  }

  @Get("dashboard-mini")
  @ApiOperation({
    summary:
      "Краткие P&L / баланс / движение денег (101+221) за текущий UTC-месяц для главной",
  })
  dashboardMini(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.reporting.dashboardMiniFinancials(
      organizationId,
      parseLedgerTypeQuery(ledgerType),
    );
  }

  @Get("receivables")
  @ApiOperation({
    summary: "Дебиторка (счёт 211): долг контрагентов с начисленной выручкой без оплаты",
  })
  receivables(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.reporting.accountsReceivable(
      organizationId,
      parseLedgerTypeQuery(ledgerType),
    );
  }

  @Get("netting/preview")
  @ApiOperation({
    summary:
      "Кандидат на взаимозачёт (FinanceService.getNettingCandidate): 211, 531, min, canNet",
  })
  nettingPreview(
    @OrganizationId() organizationId: string,
    @Query("counterpartyId") counterpartyId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    if (!counterpartyId?.trim()) {
      throw new BadRequestException("counterpartyId is required");
    }
    return this.finance.getNettingCandidate(
      organizationId,
      counterpartyId,
      parseLedgerTypeQuery(ledgerType),
    );
  }

  @Post("netting")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Взаимозачёт (FinanceService.executeNetting): Дт 531 — Кт 211",
  })
  createNetting(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateNettingDto,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.finance.executeNetting(
      organizationId,
      dto.counterpartyId,
      dto.amount,
      parseLedgerTypeQuery(ledgerType),
      requireOrgRole(user),
      {
        userId: user.userId,
        previewSuggestedAmount: dto.previewSuggestedAmount,
      },
    );
  }

  @Get("reconciliation")
  @ApiOperation({
    summary:
      "Акт сверки с контрагентом: сальдо, обороты по счетам и платежам за период",
  })
  reconciliation(
    @OrganizationId() organizationId: string,
    @Query("counterpartyId") counterpartyId: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("currency") currency?: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    const from = dateFrom ?? startDate;
    const to = dateTo ?? endDate;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        "dateFrom/dateTo or startDate/endDate are required (YYYY-MM-DD)",
      );
    }
    return this.reporting.counterpartyReconciliation(
      organizationId,
      counterpartyId,
      from,
      to,
      {
        currency: currency ?? null,
        ledgerType: parseLedgerTypeQuery(ledgerType) ?? undefined,
      },
    );
  }

  @Get("reconciliation/pdf")
  @ApiOperation({
    summary:
      "PDF акта сверки (AZ): qarşılıqlı hesablaşma, cədvəl, imzalar",
  })
  async reconciliationPdf(
    @OrganizationId() organizationId: string,
    @Query("counterpartyId") counterpartyId: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("currency") currency?: string,
    @Query("ledgerType") ledgerType?: string,
  ): Promise<StreamableFile> {
    const from = dateFrom ?? startDate;
    const to = dateTo ?? endDate;
    if (!from?.trim() || !to?.trim()) {
      throw new BadRequestException(
        "dateFrom/dateTo or startDate/endDate are required (YYYY-MM-DD)",
      );
    }
    const { buffer, filename } =
      await this.reporting.counterpartyReconciliationPdf(
        organizationId,
        counterpartyId,
        from,
        to,
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

  @Get("aging")
  @ApiOperation({
    summary:
      "AR Aging: старение дебиторки (0-30 / 31-60 / 61-90 / 90+), date asOf optional",
  })
  aging(
    @OrganizationId() organizationId: string,
    @Query("asOf") asOf?: string,
  ) {
    return this.reporting.accountsReceivableAging(organizationId, asOf);
  }

  @Get("ar-aging")
  @ApiOperation({
    summary:
      "AR Aging Report: неоплаченные инвойсы по корзинам просрочки 0-30 / 31-60 / 61-90 / 90+",
  })
  arAging(
    @OrganizationId() organizationId: string,
    @Query("asOf") asOf?: string,
  ) {
    return this.reporting.accountsReceivableAging(organizationId, asOf);
  }

  @Get("vat-appendix-xlsx")
  @ApiOperation({
    summary:
      "Excel: список продаж/покупок с НДС за квартал (e-taxes.gov.az, приложение к декларации)",
  })
  async vatAppendixXlsx(
    @OrganizationId() organizationId: string,
    @Query("year") yearStr: string,
    @Query("quarter") quarterStr: string,
  ): Promise<StreamableFile> {
    const year = Number(yearStr);
    const quarter = Number(quarterStr);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new BadRequestException("Invalid year");
    }
    if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
      throw new BadRequestException("Invalid quarter (1–4)");
    }
    const { buffer, filename } =
      await this.vatAppendix.buildQuarterlyXlsxBuffer(
        organizationId,
        year,
        quarter,
      );
    return new StreamableFile(buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get("etaxes-vat-declaration")
  @ApiOperation({
    summary:
      "JSON-пакет ƏDV əlavəsi (e-taxes.gov.az / BTP sahələri) və yoxlama nəticəsi",
  })
  etaxesVatDeclarationPreview(
    @OrganizationId() organizationId: string,
    @Query("year") yearStr: string,
    @Query("quarter") quarterStr: string,
  ) {
    const year = Number(yearStr);
    const quarter = Number(quarterStr);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new BadRequestException("Invalid year");
    }
    if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
      throw new BadRequestException("Invalid quarter (1–4)");
    }
    return this.etaxes.buildDeclarationPackage(organizationId, year, quarter);
  }

  @Post("etaxes-vat-declaration/submit")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "ƏDV paketini vergi şlüzünə göndər (E_TAXES_VAT_SUBMIT_URL)",
  })
  etaxesVatDeclarationSubmit(
    @OrganizationId() organizationId: string,
    @Query("year") yearStr: string,
    @Query("quarter") quarterStr: string,
  ) {
    const year = Number(yearStr);
    const quarter = Number(quarterStr);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      throw new BadRequestException("Invalid year");
    }
    if (!Number.isFinite(quarter) || quarter < 1 || quarter > 4) {
      throw new BadRequestException("Invalid quarter (1–4)");
    }
    return this.etaxes.submitDeclarationToGateway(organizationId, year, quarter);
  }

  @Get("tax-declarations")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "List e-Taxes declaration exports with workflow statuses",
  })
  listTaxDeclarations(@OrganizationId() organizationId: string) {
    return this.taxExport.list(organizationId);
  }

  @Post("tax-declarations/generate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Generate declaration file for e-taxes (status: GENERATED)",
  })
  generateTaxDeclaration(
    @OrganizationId() organizationId: string,
    @Body() dto: GenerateTaxDeclarationDto,
  ) {
    return this.taxExport.generate(organizationId, dto);
  }

  @Get("tax-declarations/:id/download")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Download generated declaration file and mark as UPLOADED",
  })
  async downloadTaxDeclaration(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const out = await this.taxExport.downloadGenerated(organizationId, id);
    return new StreamableFile(out.buffer, {
      type: out.contentType,
      disposition: `attachment; filename="${out.filename}"`,
    });
  }

  @Post("tax-declarations/:id/receipt")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({
    summary: "Attach Elektron Bildiriş PDF and mark declaration CONFIRMED_BY_TAX",
  })
  attachReceipt(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.taxExport.attachReceipt(organizationId, id, file);
  }

  @Post("close-period")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Закрыть месяц: isLocked + запись в settings.reporting.closedPeriods" })
  closePeriod(
    @OrganizationId() organizationId: string,
    @Body() dto: ClosePeriodDto,
  ) {
    return this.reporting.closePeriod(organizationId, dto.year, dto.month);
  }
}
