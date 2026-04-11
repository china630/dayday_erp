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
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { TimesheetBatchUpdateDto } from "./dto/timesheet-batch.dto";
import { TimesheetService } from "./timesheet.service";

@ApiTags("hr-timesheet")
@ApiBearerAuth("bearer")
@Controller("hr/timesheets")
export class TimesheetController {
  constructor(private readonly timesheet: TimesheetService) {}

  @Get()
  @ApiOperation({
    summary: "Табель за месяц (по умолчанию создаёт черновик). create=false — только чтение",
  })
  find(
    @OrganizationId() organizationId: string,
    @Query("year") year: string,
    @Query("month") month: string,
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
    if (create === "false") {
      return this.timesheet.findByMonthIfExists(organizationId, y, m);
    }
    return this.timesheet.getOrCreate(organizationId, y, m);
  }

  @Post(":id/autofill")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Автозаполнение: WORK в рабочие дни, OFF в выходные (АР 2026 — производственный календарь)",
  })
  autofill(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.timesheet.autofill(organizationId, id);
  }

  @Post(":id/sync-absences")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Синхронизация утверждённых отпусков/больничных (ячейки блокируются)",
  })
  syncAbsences(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.timesheet.syncAbsences(organizationId, id);
  }

  @Patch(":id/entries/batch")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Пакетное обновление диапазона дней для сотрудника" })
  batch(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: TimesheetBatchUpdateDto,
  ) {
    return this.timesheet.batchUpdate(organizationId, id, dto.batches);
  }

  @Post(":id/approve")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Утвердить табель (READ_ONLY)" })
  approve(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.timesheet.approve(organizationId, id);
  }
}
