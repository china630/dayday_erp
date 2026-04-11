import {
  Controller,
  Get,
  NotFoundException,
  Param,
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
import type { Prisma } from "@dayday/database";
import { OrganizationId } from "../common/org-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@ApiBearerAuth("bearer")
@Controller("audit")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("recent")
  @ApiOperation({
    summary: "Последние записи AuditLog (совместимость)",
  })
  async recent(
    @OrganizationId() organizationId: string,
    @Query("take") takeRaw?: string,
  ) {
    const n = Math.min(
      100,
      Math.max(1, Number.parseInt(takeRaw ?? "20", 10) || 20),
    );
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: n,
      select: {
        id: true,
        userId: true,
        entityType: true,
        entityId: true,
        action: true,
        createdAt: true,
        changes: true,
        oldValues: true,
        newValues: true,
        hash: true,
      },
    });
  }

  @Get("logs")
  @ApiOperation({
    summary: "Журнал аудита с фильтрами",
  })
  async logs(
    @OrganizationId() organizationId: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("entityType") entityType?: string,
    @Query("action") action?: string,
    @Query("take") takeRaw?: string,
  ) {
    const take = Math.min(
      100,
      Math.max(1, Number.parseInt(takeRaw ?? "50", 10) || 50),
    );
    const where: Prisma.AuditLogWhereInput = { organizationId };
    if (userId) {
      where.userId = userId;
    }
    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = new Date(from);
      }
      if (to) {
        where.createdAt.lte = new Date(to);
      }
    }
    if (entityType) {
      where.entityType = entityType;
    }
    if (action) {
      where.action = action;
    }
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: { select: { id: true, email: true } },
      },
    });
  }

  @Get("logs/:id")
  @ApiOperation({ summary: "Одна запись аудита" })
  async logOne(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    const row = await this.prisma.auditLog.findFirst({
      where: { id, organizationId },
      include: {
        user: { select: { id: true, email: true } },
      },
    });
    if (!row) {
      throw new NotFoundException("Audit log not found");
    }
    return row;
  }

  @Post("integrity-check")
  @ApiOperation({
    summary: "Проверка целостности хешей audit_logs для организации",
  })
  async integrityCheck(@OrganizationId() organizationId: string) {
    return this.audit.verifyOrganizationLogs(organizationId);
  }
}
