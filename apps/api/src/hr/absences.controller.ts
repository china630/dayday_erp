import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { AbsencesService } from "./absences.service";
import { CreateAbsenceDto } from "./dto/create-absence.dto";
import { SickPayCalcDto } from "./dto/sick-pay-calc.dto";
import { UpdateAbsenceDto } from "./dto/update-absence.dto";
import { VacationPayCalcDto } from "./dto/vacation-pay-calc.dto";

@ApiTags("hr-absences")
@ApiBearerAuth("bearer")
@Controller("hr/absences")
export class AbsencesController {
  constructor(
    private readonly absences: AbsencesService,
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
  @ApiOperation({ summary: "Список отсутствий (отпуск / больничный)" })
  async list(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.absences.list(organizationId, departmentId);
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: "Запись отсутствия" })
  async getOne(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.absences.getOne(organizationId, id, departmentId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: "Создать запись отсутствия" })
  async create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateAbsenceDto,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.absences.create(organizationId, dto, departmentId);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: "Обновить запись" })
  async update(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: UpdateAbsenceDto,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.absences.update(organizationId, id, dto, departmentId);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(
    UserRole.OWNER,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.HR_MANAGER,
    UserRole.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: "Удалить запись" })
  async remove(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const role = requireOrgRole(user);
    const departmentId = isDepartmentHeadRole(role)
      ? await this.scope.resolveManagedDepartmentId(organizationId, user.userId)
      : undefined;
    return this.absences.remove(organizationId, id, departmentId);
  }

  @Post("vacation-pay/calculate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Расчёт отпускных: средняя ЗП за 12 мес. до месяца отпуска / 30.4 × календарные дни",
  })
  calcVacationPay(
    @OrganizationId() organizationId: string,
    @Body() dto: VacationPayCalcDto,
  ) {
    return this.absences.calculateVacationPay(
      organizationId,
      dto.employeeId,
      dto.vacationStart,
      dto.vacationEnd,
      dto.absenceTypeId,
    );
  }

  @Post("sick-pay/calculate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Xəstəlik vərəqəsi: ilk 14 gün işəgötürən (staj %), qalan təqvim günləri DSMF (kənar)",
  })
  calcSickPay(
    @OrganizationId() organizationId: string,
    @Body() dto: SickPayCalcDto,
  ) {
    return this.absences.calculateSickPay(organizationId, dto);
  }
}
