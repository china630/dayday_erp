import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { OrganizationId } from "../common/org-id.decorator";
import { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";
import { PayrollHeavyQueueService } from "./payroll-heavy.queue";
import { PayrollExportService } from "./payroll-export.service";
import { PayrollService } from "./payroll.service";
import { PayrollPayoutDto } from "./dto/payroll-payout.dto";

@ApiTags("hr-payroll")
@ApiBearerAuth("bearer")
@Controller("hr/payroll")
@UseGuards(RolesGuard)
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly payrollQueue: PayrollHeavyQueueService,
    private readonly exportService: PayrollExportService,
  ) {}

  @Get("runs")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Список расчётных периодов" })
  listRuns(@OrganizationId() organizationId: string) {
    return this.payroll.listRuns(organizationId);
  }

  @Get("bank-accounts")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Organization bank accounts for payroll payout selector" })
  listPayoutBankAccounts(@OrganizationId() organizationId: string) {
    return this.payroll.listPayoutBankAccounts(organizationId);
  }

  @Get("runs/:id")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Расчёт с листовками" })
  getRun(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.payroll.getRun(organizationId, id);
  }

  @Get("runs/:id/xlsx")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Excel export: payroll run slips (e-taxes.gov.az template)",
  })
  async runXlsx(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.exportService.buildRunXlsxBuffer(
      organizationId,
      id,
    );
    return new StreamableFile(buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post("runs")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать черновик зарплаты за месяц" })
  createRun(
    @OrganizationId() organizationId: string,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.payroll.createDraftRun(organizationId, dto);
  }

  @Post("runs/:id/post")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Утвердить payroll run (POSTED). Финальные проводки выполняются при SalaryRegistry -> PAID",
  })
  postRun(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.payroll.postRun(organizationId, id);
  }

  @Post("runs/:id/pay")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Create salary registry and prepare payout via selected organization bank account",
  })
  payRun(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: PayrollPayoutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.createAndPrepareSalaryRegistry(
      organizationId,
      id,
      dto,
      requireOrgRole(user),
    );
  }

  @Get("runs/:id/registries")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Salary registries for payroll run" })
  runRegistries(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.payroll.listRunSalaryRegistries(organizationId, id);
  }

  @Post("registries/:id/mark-paid")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Manual reconciliation: mark salary registry as PAID" })
  markRegistryPaid(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.payroll.markSalaryRegistryPaid(organizationId, id);
  }

  @Get("registries/:id/export-link")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Get temporary export link (TTL) for salary registry file" })
  exportLink(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.payroll.createSalaryRegistryExportLink(organizationId, id);
  }

  @Get("registries/:id/export")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Download salary registry export by temporary signature" })
  async exportFile(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Query("exp") exp: string,
    @Query("sig") sig: string,
  ): Promise<StreamableFile> {
    const { key, buffer } = await this.payroll.loadSalaryRegistryExportFile(
      organizationId,
      id,
      exp,
      sig,
    );
    const filename = key.split("/").pop() ?? "salary-registry.xlsx";
    return new StreamableFile(buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get("jobs/:jobId")
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Статус фоновой задачи зарплаты (BullMQ)",
  })
  async jobStatus(@Param("jobId") jobId: string) {
    const s = await this.payrollQueue.getJobState(jobId);
    if (!s) {
      throw new NotFoundException("Job not found");
    }
    return s;
  }
}
