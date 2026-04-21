import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { OrganizationId } from "../common/org-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AdminAuditLogsService } from "./audit.service";
import { AdminAuditLogsQueryDto } from "./dto/admin-audit-logs-query.dto";

@ApiTags("admin-audit")
@ApiBearerAuth("bearer")
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class AdminAuditLogsController {
  constructor(private readonly adminAuditLogs: AdminAuditLogsService) {}

  @Get("audit-logs")
  @ApiOperation({
    summary: "Security audit log (OWNER): filters + pagination",
  })
  async auditLogs(
    @OrganizationId() organizationId: string,
    @Query() q: AdminAuditLogsQueryDto,
  ) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    return this.adminAuditLogs.listAuditLogs(organizationId, {
      userId: q.userId,
      entityName: q.entityName?.trim() || undefined,
      entityId: q.entityId?.trim() || undefined,
      from: q.from?.trim() || undefined,
      to: q.to?.trim() || undefined,
      page,
      pageSize,
    });
  }
}
