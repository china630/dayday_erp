import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CoaTemplateProfile, UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { AccountsService } from "./accounts.service";
import { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import { ImportFromTemplateDto } from "./dto/import-from-template.dto";

function parseTemplateProfileQuery(
  raw?: string,
): CoaTemplateProfile | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === "full") return CoaTemplateProfile.COMMERCIAL_FULL;
  if (v === "small") return CoaTemplateProfile.COMMERCIAL_SMALL;
  return undefined;
}

@ApiTags("accounts")
@ApiBearerAuth("bearer")
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get("chart/cash-catalog")
  @ApiOperation({
    summary:
      "Справочник счетов кассы (101 / 102) из глобального плана счетов АР",
  })
  cashChartCatalog(
    @Query("locale") locale?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.accounts.listCashChartCatalogEntries(
      locale?.trim() || acceptLanguage,
    );
  }

  @Get("templates")
  @ApiOperation({
    summary:
      "Глобальный NAS (`template_accounts`): счета, которых ещё нет в плане организации (поиск, опционально profile=full|small)",
  })
  nasTemplates(
    @OrganizationId() organizationId: string,
    @Query("search") search?: string,
    @Query("profile") profile?: string,
    @Query("locale") locale?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.accounts.listNasTemplateCatalogForImport(organizationId, {
      search,
      locale: locale?.trim() || acceptLanguage,
      templateProfile: parseTemplateProfileQuery(profile),
    });
  }

  @Get()
  @ApiOperation({ summary: "Список счетов по книге (NAS / IFRS)" })
  list(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
    @Query("locale") locale?: string,
    @Headers("accept-language") acceptLanguage?: string,
  ) {
    return this.accounts.listAccounts(
      organizationId,
      parseLedgerTypeQuery(ledgerType),
      locale?.trim() || acceptLanguage,
    );
  }

  @Post("ifrs-mirror")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      "Создать недостающие IFRS-счета по структуре NAS (копия плана счетов)",
  })
  mirrorIfrs(@OrganizationId() organizationId: string) {
    return this.accounts.mirrorNasToIfrs(organizationId);
  }

  @Post("import-from-template")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary: "Импортировать NAS-счёт из глобального шаблона в план организации",
  })
  importFromTemplate(
    @OrganizationId() organizationId: string,
    @Body() dto: ImportFromTemplateDto,
  ) {
    return this.accounts.importNasAccountFromTemplate(
      organizationId,
      dto.templateAccountId,
    );
  }

  @Post("bank-accounts")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Create a bank ledger account (221.xx)" })
  createBankAccount(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.accounts.createBankAccount(organizationId, dto);
  }
}
