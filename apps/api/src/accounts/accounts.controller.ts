import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { AccountsService } from "./accounts.service";
import { CreateBankAccountDto } from "./dto/create-bank-account.dto";

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
  cashChartCatalog() {
    return this.accounts.listCashChartCatalogEntries();
  }

  @Get()
  @ApiOperation({ summary: "Список счетов по книге (NAS / IFRS)" })
  list(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    return this.accounts.listAccounts(
      organizationId,
      parseLedgerTypeQuery(ledgerType),
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
