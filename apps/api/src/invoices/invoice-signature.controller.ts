import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { OrganizationId } from "../common/org-id.decorator";
import { SignatureService } from "../signature/signature.service";
import { InitiateSignatureDto } from "./dto/initiate-signature.dto";
import { InvoicesService } from "./invoices.service";

@ApiTags("invoices")
@ApiBearerAuth("bearer")
@Controller("invoices")
export class InvoiceSignatureController {
  constructor(
    private readonly signatures: SignatureService,
    private readonly invoices: InvoicesService,
  ) {}

  @Post(":id/signature/initiate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Запуск ЭЦП: ASAN İmza (мобильное подтверждение) или SİMA (биометрия; в ответе simQrPayload для QR). SIGNATURE_GATEWAY_MOCK=1 — авто-завершение ~2 с при опросе. SIMA_QR_PAYLOAD_URL — URL от шлюза вместо mock JSON.",
  })
  async initiate(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Body() dto: InitiateSignatureDto,
  ) {
    return this.signatures.initiateInvoiceSignature(orgId, id, dto.provider);
  }

  @Get(":id/signature/:logId/status")
  @ApiOperation({ summary: "Статус сессии подписи (poll после initiate)" })
  async status(
    @OrganizationId() orgId: string,
    @Param("id") id: string,
    @Param("logId") logId: string,
  ) {
    const payload = await this.signatures.getInvoiceSignatureStatus(
      orgId,
      id,
      logId,
    );
    if (payload.freshCompletion) {
      await this.invoices.enqueueInvoicePdf(orgId, id);
    }
    const { freshCompletion: _f, ...rest } = payload;
    return rest;
  }
}
