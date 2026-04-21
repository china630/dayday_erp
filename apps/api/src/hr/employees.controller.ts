import {
  Body,
  Controller,
  Delete,
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
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CheckQuota } from "../common/decorators/check-quota.decorator";
import { QuotaGuard } from "../common/guards/quota.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { QuotaResource } from "../quota/quota-resource";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { EmployeesService } from "./employees.service";

@ApiTags("hr-employees")
@ApiBearerAuth("bearer")
@Controller("hr/employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: "Список сотрудников (пагинация: page, pageSize)" })
  list(
    @OrganizationId() organizationId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const p =
      page != null && page !== "" ? Number.parseInt(page, 10) : undefined;
    const ps =
      pageSize != null && pageSize !== ""
        ? Number.parseInt(pageSize, 10)
        : undefined;
    return this.employees.list(organizationId, { page: p, pageSize: ps });
  }

  @Get(":id")
  @ApiOperation({ summary: "Сотрудник по id" })
  getOne(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.employees.getOne(organizationId, id);
  }

  @Post()
  @UseGuards(QuotaGuard, RolesGuard)
  @CheckQuota(QuotaResource.USERS)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать сотрудника" })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employees.create(organizationId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Обновить сотрудника" })
  update(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.update(organizationId, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Удалить сотрудника" })
  remove(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.employees.remove(organizationId, id);
  }
}
