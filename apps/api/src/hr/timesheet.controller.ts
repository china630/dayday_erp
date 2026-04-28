import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { isDepartmentHeadRole } from "../auth/policies/hr-payroll.policy";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { OrganizationId } from "../common/org-id.decorator";
import { DepartmentHeadScopeService } from "./department-head-scope.service";
import { TimesheetBatchUpdateDto } from "./dto/timesheet-batch.dto";
import { TimesheetMassApproveDto } from "./dto/timesheet-mass-approve.dto";
import { TimesheetService } from "./timesheet.service";

@ApiTags("hr-timesheet")
@ApiBearerAuth("bearer")
@Controller("hr/timesheets")
export class TimesheetController {
  constructor(
    private readonly timesheet: TimesheetService,
    private readonly scope: DepartmentHeadScopeService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({
    summary: "Табель за месяц (по умолчанию создаёт черновик). create=false — только чтение",
  })
  async find(
    @OrganizationId() organizationId: string,
    @Query("year") year: string,
    @Query("month") month: string,
    @CurrentUser() user: AuthUser,
    @Query("create") create?: string,
  ) {
    const y = Number.parseInt(String(year ?? ""), 10);
    const m = Number.parseInt(String(month ?? ""), 10);
    if (!Number.isFinite(y) || y < 1900 || y > 2100) {
      throw new BadRequestException("year must be a valid number (1900–2100)");
    }
    if (!Number.isFinite(m) || m < 1 || m > 12) {
      throw new BadRequestException("month must be 1–12");
    }
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
        ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
        : undefined;
    if (create === "false") {
      return this.timesheet.findByMonthIfExists(
        organizationId,
        y,
        m,
        departmentId,
      );
    }
    return this.timesheet.getOrCreate(organizationId, y, m, departmentId);
  }

  @Post(":id/autofill")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({
    summary:
      "Автозаполнение: WORK в рабочие дни, OFF в выходные (АР 2026 — производственный календарь)",
  })
  async autofill(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.timesheet.autofill(organizationId, id, departmentId);
  }

  @Post(":id/sync-absences")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({
    summary: "Синхронизация утверждённых отпусков/больничных (ячейки блокируются)",
  })
  async syncAbsences(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.timesheet.syncAbsences(organizationId, id, departmentId);
  }

  @Patch(":id/entries/batch")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: "Пакетное обновление диапазона дней для сотрудника" })
  async batch(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: TimesheetBatchUpdateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.timesheet.batchUpdate(
      organizationId,
      id,
      dto.batches,
      departmentId,
    );
  }

  @Post(":id/approve")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: "Утвердить табель (READ_ONLY)" })
  async approve(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.timesheet.approve(organizationId, id, departmentId);
  }

  @Post(":id/approve-mass")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: "Массово утвердить сотрудников в табеле (scope-aware)" })
  async approveMass(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: TimesheetMassApproveDto,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.timesheet.massApprove(
      organizationId,
      id,
      dto.employeeIds,
      departmentId,
    );
  }
}
