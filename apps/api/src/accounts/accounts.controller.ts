import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
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

@ApiTags("accounts")
@ApiBearerAuth("bearer")
@Controller("accounts")
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

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
}
