import { Body, Controller, ParseArrayPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { OpeningBalanceFinanceLineDto } from "./dto/opening-balance-finance-line.dto";
import { OpeningBalanceHrLineDto } from "./dto/opening-balance-hr-line.dto";
import { OpeningBalanceInventoryLineDto } from "./dto/opening-balance-inventory-line.dto";
import { OpeningBalancesService } from "./opening-balances.service";

@ApiTags("migration-opening-balances")
@ApiBearerAuth("bearer")
@Controller("migration/opening-balances")
export class OpeningBalancesController {
  constructor(private readonly openingBalances: OpeningBalancesService) {}

  @Post("finance")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Opening Balances (Finance): Dr/Cr posting with technical account 000 in one transaction.",
  })
  importFinance(
    @OrganizationId() organizationId: string,
    @Body(new ParseArrayPipe({ items: OpeningBalanceFinanceLineDto }))
    lines: OpeningBalanceFinanceLineDto[],
  ) {
    return this.openingBalances.importFinance(organizationId, lines);
  }

  @Post("hr")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Opening Balances (HR): import employees with migration baseline fields.",
  })
  importHr(
    @OrganizationId() organizationId: string,
    @Body(new ParseArrayPipe({ items: OpeningBalanceHrLineDto }))
    lines: OpeningBalanceHrLineDto[],
  ) {
    return this.openingBalances.importHr(organizationId, lines);
  }

  @Post("inventory")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Opening Balances (Inventory): Dr 201/204 - Cr 000 plus StockMovement IN in one transaction.",
  })
  importInventory(
    @OrganizationId() organizationId: string,
    @Body(new ParseArrayPipe({ items: OpeningBalanceInventoryLineDto }))
    lines: OpeningBalanceInventoryLineDto[],
  ) {
    return this.openingBalances.importInventory(organizationId, lines);
  }
}
