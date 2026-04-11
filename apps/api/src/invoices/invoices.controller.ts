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
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { RecordInvoicePaymentDto } from "./dto/record-invoice-payment.dto";
import { UpdateInvoiceStatusDto } from "./dto/update-invoice-status.dto";
import { InvoicesService } from "./invoices.service";

@ApiTags("invoices")
@ApiBearerAuth("bearer")
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: "Список инвойсов организации" })
  list(@OrganizationId() orgId: string) {
    return this.invoices.list(orgId);
  }

  @Post(":id/payments")
  @ApiOperation({
    summary:
      "Записать оплату (частичную или полную). Статус PAID только при полной выплате.",
  })
  recordPayment(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Body() dto: RecordInvoicePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.recordPayment(
      orgId,
      id,
      {
        amount: dto.amount,
        paymentDate: dto.paymentDate,
        debitAccountCode: dto.debitAccountCode,
      },
      requireOrgRole(user),
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Инвойс с позициями" })
  getOne(@OrganizationId() orgId: string, @Param("id") id: string) {
    return this.invoices.getOne(orgId, id);
  }

  @Post()
  @ApiOperation({ summary: "Создать инвойс (DRAFT), поставить PDF в очередь" })
  create(@OrganizationId() orgId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(orgId, dto);
  }

  @Patch(":id/status")
  @ApiOperation({
    summary:
      "SENT: Дт 211 Кт 601 (+ склад). PAID: оплата остатка целиком (части — POST …/payments). Статус PARTIALLY_PAID только через платежи.",
  })
  updateStatus(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Body() dto: UpdateInvoiceStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.updateStatus(orgId, id, dto.status, requireOrgRole(user));
  }

  @Post(":id/send-email")
  @ApiOperation({ summary: "Отправить PDF инвойса на email контрагента (counterparty.email)" })
  sendEmail(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.sendInvoiceEmail(orgId, id, requireOrgRole(user));
  }
}
