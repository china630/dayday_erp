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
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { AbsencesService } from "./absences.service";
import { CreateAbsenceDto } from "./dto/create-absence.dto";
import { UpdateAbsenceDto } from "./dto/update-absence.dto";
import { VacationPayCalcDto } from "./dto/vacation-pay-calc.dto";

@ApiTags("hr-absences")
@ApiBearerAuth("bearer")
@Controller("hr/absences")
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  @Get()
  @ApiOperation({ summary: "Список отсутствий (отпуск / больничный)" })
  list(@OrganizationId() organizationId: string) {
    return this.absences.list(organizationId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Запись отсутствия" })
  getOne(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.absences.getOne(organizationId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать запись отсутствия" })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateAbsenceDto,
  ) {
    return this.absences.create(organizationId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить запись" })
  update(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: UpdateAbsenceDto,
  ) {
    return this.absences.update(organizationId, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Удалить запись" })
  remove(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.absences.remove(organizationId, id);
  }

  @Post("vacation-pay/calculate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
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
    );
  }
}
