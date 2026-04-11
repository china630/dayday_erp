import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";
import { PayrollHeavyQueueService } from "./payroll-heavy.queue";
import { PayrollService } from "./payroll.service";

@ApiTags("hr-payroll")
@ApiBearerAuth("bearer")
@Controller("hr/payroll")
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly payrollQueue: PayrollHeavyQueueService,
  ) {}

  @Get("runs")
  @ApiOperation({ summary: "Список расчётных периодов" })
  listRuns(@OrganizationId() organizationId: string) {
    return this.payroll.listRuns(organizationId);
  }

  @Get("runs/:id")
  @ApiOperation({ summary: "Расчёт с листовками" })
  getRun(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.payroll.getRun(organizationId, id);
  }

  @Post("runs")
  @ApiOperation({ summary: "Создать черновик зарплаты за месяц" })
  createRun(
    @OrganizationId() organizationId: string,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.payroll.createDraftRun(organizationId, dto);
  }

  @Post("runs/:id/post")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Провести зарплату (проводки 721/533/521.xx)" })
  postRun(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.payroll.postRun(organizationId, id);
  }

  @Get("jobs/:jobId")
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
