import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { OrganizationId } from "../common/org-id.decorator";
import { CreateInventoryAuditDto } from "./dto/create-inventory-audit.dto";
import { InventoryAuditService } from "./inventory-audit.service";

@ApiTags("inventory-audits")
@ApiBearerAuth("bearer")
@Controller("inventory/audits")
export class InventoryAuditController {
  constructor(private readonly audits: InventoryAuditService) {}

  @Get()
  @ApiOperation({ summary: "Список инвентаризационных описей" })
  findAll(@OrganizationId() organizationId: string) {
    return this.audits.findAll(organizationId);
  }

  @Patch("lines/:lineId")
  @ApiOperation({
    summary:
      "Обновить строку описи (DRAFT): factQty и costPrice (запрещено в APPROVED/закрытом периоде)",
  })
  patchLine(
    @OrganizationId() organizationId: string,
    @Param("lineId") lineId: string,
    @Body()
    dto: {
      factQty?: number;
      costPrice?: number;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.audits.patchLine(
      organizationId,
      lineId,
      dto,
      requireOrgRole(user),
    );
  }

  @Post(":id/approve")
  @ApiOperation({
    summary:
      "Провести черновик опись: adjustStock + journal в одной prisma.$transaction (TZ §10.1)",
  })
  approveDraft(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.audits.approveDraft(
      organizationId,
      id,
      requireOrgRole(user),
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Опись по id" })
  findOne(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.audits.findOne(organizationId, id);
  }

  @Post()
  @ApiOperation({
    summary:
      "Инвентаризационная опись: DRAFT — только запись; APPROVED — корректировки в одной транзакции (adjustStockInTransaction(tx)) по расхождениям",
  })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateInventoryAuditDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.audits.create(organizationId, dto, requireOrgRole(user));
  }
}
