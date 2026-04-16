import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { BankStatementChannel } from "@dayday/database";
import { UserRole } from "@dayday/database";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { AuthUser } from "../auth/types/auth-user";
import { requireOrgRole } from "../auth/require-org-role";
import { OrganizationId } from "../common/org-id.decorator";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { BankIntegrationService } from "./bank-integration.service";
import { BankMatchService } from "./bank-match.service";
import { BankingService } from "./banking.service";
import { CashOutDto } from "./dto/cash-out.dto";
import { ManualBankEntryDto } from "./dto/manual-bank-entry.dto";
import { MatchBankLineDto } from "./dto/match-line.dto";
import { RequiresModule } from "../subscription/requires-module.decorator";
import { SubscriptionGuard } from "../subscription/subscription.guard";
import { ModuleEntitlement } from "../subscription/subscription.constants";

@ApiTags("banking")
@ApiBearerAuth("bearer")
@UseGuards(SubscriptionGuard)
@RequiresModule(ModuleEntitlement.BANKING_PRO)
@Controller("banking")
export class BankingController {
  constructor(
    private readonly banking: BankingService,
    private readonly bankMatch: BankMatchService,
    private readonly bankIntegration: BankIntegrationService,
  ) {}

  @Get("account-cards")
  @ApiOperation({
    summary:
      "Карточки по счетам кассы (101*) и банка (221–224) — сальдо по ОСВ",
  })
  accountCards(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    const lt = parseLedgerTypeQuery(ledgerType);
    return this.banking.getAccountCards(organizationId, lt);
  }

  @Post("import")
  @ApiOperation({ summary: "Загрузка CSV выписки (ABB, Pasha и др.)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        bankName: { type: "string", example: "Pasha Bank" },
        channel: { type: "string", enum: ["BANK", "CASH"] },
      },
      required: ["file", "bankName"],
    },
  })
  @UseInterceptors(FileInterceptor("file"))
  async importCsv(
    @OrganizationId() organizationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("bankName") bankName?: string,
    @Body("channel") channelRaw?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("file required");
    }
    const name = (bankName ?? "").trim();
    if (!name) {
      throw new BadRequestException("bankName required");
    }
    const channel = this.parseStatementChannel(channelRaw);
    return this.banking.importCsv(
      organizationId,
      file.buffer,
      name,
      file.originalname,
      channel,
    );
  }

  @Post("cash-out")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Нəqd məxaric: Дт 731 / Кт 101.01 + строка реестра (касса)",
  })
  cashOut(
    @OrganizationId() organizationId: string,
    @Body() dto: CashOutDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.banking.manualCashOut(organizationId, dto, requireOrgRole(user));
  }

  @Post("manual-entry")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Ручная банковская операция: проводка (Дт/Кт банк + второй счёт) + строка реестра",
  })
  manualBankEntry(
    @OrganizationId() organizationId: string,
    @Body() dto: ManualBankEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    requireOrgRole(user);
    return this.banking.manualBankEntry(organizationId, dto);
  }

  private parseStatementChannel(raw: string | undefined): BankStatementChannel {
    const u = (raw ?? "").trim().toUpperCase();
    if (u === "" || u === "BANK") return BankStatementChannel.BANK;
    if (u === "CASH") return BankStatementChannel.CASH;
    throw new BadRequestException('Invalid channel (use "BANK" or "CASH")');
  }

  @Get("statements")
  @ApiOperation({ summary: "Список загруженных выписок" })
  listStatements(@OrganizationId() organizationId: string) {
    return this.banking.listStatements(organizationId);
  }

  @Post("sync")
  @ApiOperation({
    summary:
      "Direct Banking: ручная синхронизация (mock Pasha + ABB), автосверка уникальных кандидатов",
  })
  triggerDirectSync(@OrganizationId() organizationId: string) {
    return this.bankIntegration.runDirectSync(organizationId, "manual");
  }

  @Get("sync/status")
  @ApiOperation({
    summary: "Статус последней синхронизации и URL вебхука для банка",
  })
  directSyncStatus(@OrganizationId() organizationId: string) {
    return this.bankIntegration.getSyncStatus(organizationId);
  }

  @Get("lines")
  @ApiOperation({ summary: "Строки выписок (операции)" })
  listLines(
    @OrganizationId() organizationId: string,
    @Query("bankStatementId") bankStatementId?: string,
    @Query("unmatchedOnly") unmatchedOnly?: string,
    @Query("needsAttention") needsAttention?: string,
    @Query("channel") channel?: string,
    @Query("bankOnly") bankOnly?: string,
  ) {
    const ch = channel?.trim().toUpperCase();
    const channelFilter =
      ch === "BANK" || ch === "CASH" ? ch : undefined;
    return this.banking.listLines(organizationId, {
      bankStatementId: bankStatementId || undefined,
      unmatchedOnly: unmatchedOnly === "1" || unmatchedOnly === "true",
      needsAttention: needsAttention === "1" || needsAttention === "true",
      channel: channelFilter,
      bankOnly: bankOnly === "1" || bankOnly === "true",
    });
  }

  @Get("lines/:lineId/candidates")
  @ApiOperation({
    summary: "Инвойсы-кандидаты для сверки (сумма + VÖEN)",
  })
  candidates(
    @OrganizationId() organizationId: string,
    @Param("lineId") lineId: string,
  ) {
    return this.bankMatch.findCandidates(organizationId, lineId);
  }

  @Post("lines/:lineId/match")
  @ApiOperation({
    summary:
      "Подтвердить Match: PAID + проводка, либо только привязка если инвойс уже PAID",
  })
  match(
    @OrganizationId() organizationId: string,
    @Param("lineId") lineId: string,
    @Body() dto: MatchBankLineDto,
  ) {
    return this.bankMatch.confirmMatch(
      organizationId,
      lineId,
      dto.invoiceId,
    );
  }
}
