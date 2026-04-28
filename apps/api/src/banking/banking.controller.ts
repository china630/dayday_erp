import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
import { BankingGatewayService } from "./banking-gateway.service";
import { CashOutDto } from "./dto/cash-out.dto";
import { ManualBankEntryDto } from "./dto/manual-bank-entry.dto";
import { MatchBankLineDto } from "./dto/match-line.dto";
import { SendBankPaymentDraftDto } from "./dto/send-bank-payment-draft.dto";
import { ValidateIbanDto } from "./dto/validate-iban.dto";
import { RequiresModule } from "../subscription/requires-module.decorator";
import { SubscriptionGuard } from "../subscription/subscription.guard";
import { ModuleEntitlement } from "../subscription/subscription.constants";
import { IbanValidationService } from "./iban-validation.service";
import { IntegrationReliabilityService } from "../integrations/integration-reliability.service";

@ApiTags("banking")
@ApiBearerAuth("bearer")
@UseGuards(SubscriptionGuard)
@RequiresModule(ModuleEntitlement.BANKING_PRO)
@Controller("banking")
export class BankingController {
  constructor(
    private readonly banking: BankingService,
    private readonly gateway: BankingGatewayService,
    private readonly bankMatch: BankMatchService,
    private readonly bankIntegration: BankIntegrationService,
    private readonly ibanValidation: IbanValidationService,
    private readonly reliability: IntegrationReliabilityService,
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

  @Get("balances")
  @ApiOperation({
    summary:
      "Unified balances across connected bank providers (Pasha/ABB/Birbank) by organization bankKey",
  })
  balances(@OrganizationId() organizationId: string) {
    return this.gateway.getBalances(organizationId);
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

  @Post("validate-iban")
  @ApiOperation({
    summary:
      "Deep IBAN validation via provider (available for ENTERPRISE or banking_pro module)",
  })
  validateIban(
    @OrganizationId() organizationId: string,
    @Body() dto: ValidateIbanDto,
  ) {
    return this.ibanValidation.validateViaProvider(organizationId, dto.iban);
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

  @Get("payment-drafts")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Исходящие платежные драфты в банк" })
  listPaymentDrafts(@OrganizationId() organizationId: string) {
    return this.banking.listPaymentDrafts(organizationId);
  }

  @Post("payment-drafts/send")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Отправка исходящего платежа в direct banking адаптер" })
  sendPaymentDraft(
    @OrganizationId() organizationId: string,
    @Body() dto: SendBankPaymentDraftDto,
  ) {
    return this.gateway.sendPaymentDraft(organizationId, {
      fromAccountIban: dto.fromAccountIban,
      recipientIban: dto.recipientIban,
      amount: dto.amount.toFixed(4),
      currency: dto.currency,
      purpose: dto.purpose,
      provider: dto.provider,
    });
  }

  @Post("sync")
  @ApiOperation({
    summary:
      "Direct Banking: ручная синхронизация (mock Pasha + ABB), автосверка уникальных кандидатов",
  })
  async triggerDirectSync(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.reliability.executeWithPolicies({
      provider: "banking_manual_sync",
      operation: "direct_sync",
      writeIdempotencyKey:
        idempotencyKey?.trim() || `${organizationId}:${user.userId}:direct_sync`,
      request: async () => Promise.resolve({ ok: true }),
    });
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
