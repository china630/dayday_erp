import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { CreateCashDeskDto } from "./dto/create-cash-desk.dto";
import { CreateCashFlowItemDto } from "./dto/create-cash-flow-item.dto";
import { TreasuryService } from "./treasury.service";

@ApiTags("treasury")
@ApiBearerAuth("bearer")
@Controller("treasury")
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get("cash-flow-items")
  @ApiOperation({ summary: "Справочник статей ДДС (при пустом — типовой набор)" })
  listCashFlowItems(@OrganizationId() organizationId: string) {
    return this.treasury.listOrSeedCashFlowItems(organizationId);
  }

  @Post("cash-flow-items")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Добавить статью ДДС" })
  createCashFlowItem(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateCashFlowItemDto,
  ) {
    return this.treasury.createCashFlowItem(
      organizationId,
      dto.code,
      dto.name,
    );
  }

  @Get("cash-desks")
  @ApiOperation({ summary: "Активные физические кассы" })
  listCashDesks(@OrganizationId() organizationId: string) {
    return this.treasury.listCashDesks(organizationId);
  }

  @Post("cash-desks")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать физическую кассу" })
  createCashDesk(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateCashDeskDto,
  ) {
    return this.treasury.createCashDesk(organizationId, {
      name: dto.name,
      employeeId: dto.employeeId,
      currencies: dto.currencies,
    });
  }
}
