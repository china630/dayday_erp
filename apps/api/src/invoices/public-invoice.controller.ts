import { Controller, Get, Param, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Public } from "../auth/decorators/public.decorator";
import { InvoicesService } from "./invoices.service";

/**
 * Гостевой доступ к счёту по opaque token (PRD §4.15). Без JWT; rate limit против перебора.
 */
@ApiTags("public-invoices")
@Controller("public/invoices")
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 40, ttl: 60_000 } })
export class PublicInvoiceController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(":token/pdf")
  @ApiOperation({ summary: "Guest: PDF инвойса по public token" })
  async pdf(
    @Param("token") token: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const buf = await this.invoices.getPublicInvoicePdfBuffer(token);
    const safe = token.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 24) || "invoice";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoice-${safe}.pdf"`,
    );
    res.send(buf);
  }

  @Get(":token")
  @ApiOperation({ summary: "Guest: JSON инвойса (организация, банк, оплата, позиции)" })
  get(@Param("token") token: string) {
    return this.invoices.getPublicInvoiceByToken(token);
  }
}
