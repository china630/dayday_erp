import {
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
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { CreateJobPositionDto } from "./dto/create-job-position.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";
import { UpdateJobPositionDto } from "./dto/update-job-position.dto";
import { OrgStructureService } from "./org-structure.service";

@ApiTags("hr-org-structure")
@ApiBearerAuth("bearer")
@Controller("hr")
export class OrgStructureController {
  constructor(private readonly org: OrgStructureService) {}

  @Get("org-structure/tree")
  @ApiOperation({ summary: "Дерево подразделений" })
  tree(@OrganizationId() organizationId: string) {
    return this.org.getDepartmentTree(organizationId);
  }

  @Get("departments")
  @ApiOperation({ summary: "Список подразделений (плоский)" })
  listDepartments(@OrganizationId() organizationId: string) {
    return this.org.listDepartmentsFlat(organizationId);
  }

  @Post("departments")
  @ApiOperation({ summary: "Создать подразделение" })
  createDepartment(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.org.createDepartment(organizationId, dto);
  }

  @Patch("departments/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Обновить подразделение" })
  updateDepartment(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.org.updateDepartment(organizationId, id, dto);
  }

  @Get("job-positions")
  @ApiOperation({ summary: "Штатные должности" })
  listJobPositions(
    @OrganizationId() organizationId: string,
    @Query("departmentId") departmentId?: string,
  ) {
    return this.org.listJobPositions(organizationId, departmentId);
  }

  @Post("job-positions")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Штатная единица" })
  createJobPosition(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateJobPositionDto,
  ) {
    return this.org.createJobPosition(organizationId, dto);
  }

  @Patch("job-positions/:id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Обновить штатную единицу" })
  updateJobPosition(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: UpdateJobPositionDto,
  ) {
    return this.org.updateJobPosition(organizationId, id, dto);
  }
}
