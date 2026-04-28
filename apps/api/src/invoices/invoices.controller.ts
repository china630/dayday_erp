import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { CheckQuota } from "../common/decorators/check-quota.decorator";
import { QuotaGuard } from "../common/guards/quota.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { QuotaResource } from "../quota/quota-resource";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { AllocatePaymentDto } from "./dto/allocate-payment.dto";
import { RecordInvoicePaymentDto } from "./dto/record-invoice-payment.dto";
import { UpdateInvoiceStatusDto } from "./dto/update-invoice-status.dto";
import { InvoicesService } from "./invoices.service";

@ApiTags("invoices")
@ApiBearerAuth("bearer")
@Controller("invoices")
@UseGuards(RolesGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: "Список инвойсов организации" })
  list(@OrganizationId() orgId: string) {
    return this.invoices.list(orgId);
  }

  @Post(":id/payments")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
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

  @Post("payments/allocate")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Распределить один транш оплаты на несколько инвойсов контрагента (FIFO по дате счёта)",
  })
  allocatePayment(
    @OrganizationId() orgId: string,
    @Body() dto: AllocatePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.allocatePaymentAcrossInvoices(
      orgId,
      dto,
      requireOrgRole(user),
    );
  }

  @Get(":id/portal-link")
  @ApiOperation({
    summary:
      "Публичная ссылка на портал счёта для клиента (без логина); создаёт token при первом запросе",
  })
  portalLink(@OrganizationId() orgId: string, @Param("id") id: string) {
    return this.invoices.ensurePortalShareLink(orgId, id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Инвойс с позициями" })
  getOne(@OrganizationId() orgId: string, @Param("id") id: string) {
    return this.invoices.getOne(orgId, id);
  }

  @Post()
  @UseGuards(QuotaGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @CheckQuota(QuotaResource.INVOICES_PER_MONTH)
  @ApiOperation({ summary: "Создать инвойс (DRAFT), поставить PDF в очередь" })
  create(@OrganizationId() orgId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(orgId, dto);
  }

  @Patch(":id/status")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
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
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Отправить PDF инвойса на email контрагента (counterparty.email)" })
  sendEmail(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.sendInvoiceEmail(orgId, id, requireOrgRole(user));
  }
}
