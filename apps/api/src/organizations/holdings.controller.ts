import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/types/auth-user";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { CreateHoldingDto } from "./dto/create-holding.dto";
import {
  AddHoldingMemberDto,
  UpdateHoldingMemberDto,
} from "./dto/holding-member.dto";
import { UpdateHoldingDto } from "./dto/update-holding.dto";
import { HoldingsReportingService } from "./holdings-reporting.service";
import { HoldingsService } from "./holdings.service";

@ApiTags("holdings")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("holdings")
export class HoldingsController {
  constructor(
    private readonly holdingsService: HoldingsService,
    private readonly holdingsReporting: HoldingsReportingService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Создать холдинг (владелец = текущий пользователь)" })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHoldingDto,
  ) {
    return this.holdingsService.createHolding(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: "Список холдингов (владелец или участник по HoldingMembership)",
  })
  async findAll(@CurrentUser() user: AuthUser) {
    return this.holdingsService.findAllHoldingsForUser(user.userId);
  }

  @Get(":id/consolidated-pnl")
  @ApiOperation({
    summary:
      "Сводный отчёт по прибыли/убытку (P&L) по всем организациям холдинга",
  })
  async consolidatedPnl(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.holdingsReporting.consolidatedProfitAndLoss(
      user.userId,
      id,
      dateFrom,
      dateTo,
      parseLedgerTypeQuery(ledgerType),
    );
  }

  @Get(":id/summary")
  @ApiOperation({
    summary:
      "Сводка холдинга для dashboard: cash/bank (101+221) по организациям и в базовой валюте",
  })
  async summary(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("asOf") asOf?: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.holdingsReporting.getHoldingSummary(user.userId, id, {
      asOf,
      ledgerType: parseLedgerTypeQuery(ledgerType),
    });
  }

  @Get(":id/members")
  @ApiOperation({ summary: "Участники холдинга (только владелец холдинга)" })
  async listMembers(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.holdingsService.listMembers(user.userId, id);
  }

  @Post(":id/members")
  @ApiOperation({ summary: "Добавить участника холдинга" })
  async addMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: AddHoldingMemberDto,
  ) {
    return this.holdingsService.addMember(
      user.userId,
      id,
      dto.userId,
      dto.role,
    );
  }

  @Patch(":id/members/:userId")
  @ApiOperation({ summary: "Изменить роль участника холдинга" })
  async updateMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("userId") memberUserId: string,
    @Body() dto: UpdateHoldingMemberDto,
  ) {
    return this.holdingsService.updateMemberRole(
      user.userId,
      id,
      memberUserId,
      dto.role,
    );
  }

  @Delete(":id/members/:userId")
  @ApiOperation({ summary: "Удалить участника холдинга" })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("userId") memberUserId: string,
  ) {
    return this.holdingsService.removeMember(
      user.userId,
      id,
      memberUserId,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Холдинг по ID (владелец или участник)" })
  async findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.holdingsService.findOneHoldingForAccess(user.userId, id);
  }

  @Put(":id")
  @ApiOperation({ summary: "Обновить холдинг (только владелец)" })
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateHoldingDto,
  ) {
    return this.holdingsService.updateHolding(user.userId, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Удалить холдинг (только владелец)" })
  async delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.holdingsService.deleteHolding(user.userId, id);
  }

  @Post(":holdingId/organizations/:organizationId")
  @ApiOperation({ summary: "Привязать организацию к холдингу" })
  async addOrganization(
    @CurrentUser() user: AuthUser,
    @Param("holdingId") holdingId: string,
    @Param("organizationId") organizationId: string,
  ) {
    return this.holdingsService.addOrganizationToHolding(
      user.userId,
      holdingId,
      organizationId,
    );
  }

  @Delete(":holdingId/organizations/:organizationId")
  @ApiOperation({ summary: "Отвязать организацию от холдинга" })
  async removeOrganization(
    @CurrentUser() user: AuthUser,
    @Param("holdingId") holdingId: string,
    @Param("organizationId") organizationId: string,
  ) {
    return this.holdingsService.removeOrganizationFromHolding(
      user.userId,
      holdingId,
      organizationId,
    );
  }
}
