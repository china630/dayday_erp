import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Response } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { parseLedgerTypeQuery } from "../common/ledger-type.util";
import { CashOrderService } from "./cash-order.service";
import { CreateAdvanceReportDto } from "./dto/advance-report.dto";
import { CreatePkoDraftDto } from "./dto/create-pko.dto";
import { CreateRkoDraftDto } from "./dto/create-rko.dto";
import { RequiresModule } from "../subscription/requires-module.decorator";
import { SubscriptionGuard } from "../subscription/subscription.guard";
import { ModuleEntitlement } from "../subscription/subscription.constants";

@ApiTags("banking-cash")
@ApiBearerAuth("bearer")
@UseGuards(SubscriptionGuard)
@RequiresModule(ModuleEntitlement.KASSA_PRO)
@Controller("banking/cash")
export class CashDeskController {
  constructor(private readonly cash: CashOrderService) {}

  @Get("balances")
  @ApiOperation({ summary: "Остаток кассы (101*) по валютам" })
  balances(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    const lt = parseLedgerTypeQuery(ledgerType);
    return this.cash.getCashBalancesByCurrency(organizationId, lt);
  }

  @Get("orders")
  @ApiOperation({
    summary: "Журнал кассовых ордеров (MKO/MXO — Mədaxil/Məxaric Kassa Orderi)",
  })
  orders(@OrganizationId() organizationId: string) {
    return this.cash.listOrders(organizationId);
  }

  @Post("orders/mko")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать черновик MKO (приход, CashOrderKind.MKO)" })
  createMko(
    @OrganizationId() organizationId: string,
    @Body() dto: CreatePkoDraftDto,
  ) {
    return this.cash.createDraftPko(organizationId, dto);
  }

  @Post("orders/mxo")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать черновик MXO (расход, CashOrderKind.MXO)" })
  createMxo(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateRkoDraftDto,
  ) {
    return this.cash.createDraftRko(organizationId, dto);
  }

  /** Backward-compatible aliases (will be removed later). */
  @Post("orders/pko")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "[DEPRECATED] Alias for /orders/mko" })
  createPkoAlias(
    @OrganizationId() organizationId: string,
    @Body() dto: CreatePkoDraftDto,
  ) {
    return this.cash.createDraftPko(organizationId, dto);
  }

  /** Backward-compatible aliases (will be removed later). */
  @Post("orders/rko")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "[DEPRECATED] Alias for /orders/mxo" })
  createRkoAlias(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateRkoDraftDto,
  ) {
    return this.cash.createDraftRko(organizationId, dto);
  }

  @Post("orders/:id/post")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Провести черновик ордера" })
  postOrder(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.cash.postOrder(organizationId, id);
  }

  @Get("orders/:id/print")
  @ApiOperation({ summary: "HTML бланк ордера для печати" })
  @Header("Content-Type", "text/html; charset=utf-8")
  async printOrder(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const html = await this.cash.getPrintHtml(organizationId, id);
    res.send(html);
  }

  @Get("accountable")
  @ApiOperation({ summary: "Подотчётные лица (дебет 244)" })
  accountable(
    @OrganizationId() organizationId: string,
    @Query("ledgerType") ledgerType?: string,
  ) {
    const lt = parseLedgerTypeQuery(ledgerType);
    return this.cash.listAccountablePersons(organizationId, lt);
  }

  @Post("advance-reports")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Черновик авансового отчёта" })
  createAdvance(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateAdvanceReportDto,
  ) {
    return this.cash.createAdvanceReportDraft(organizationId, dto);
  }

  @Post("advance-reports/:id/post")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Провести авансовый отчёт" })
  postAdvance(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.cash.postAdvanceReport(organizationId, id);
  }
}
