import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentWebhookDto } from "./dto/payment-webhook.dto";
import { PaymentProviderService } from "./payment-provider.service";

@ApiTags("billing-public")
@Public()
@Controller("public/billing")
export class BillingPublicController {
  constructor(
    private readonly payment: PaymentProviderService,
    private readonly config: ConfigService,
  ) {}

  @Get("mock-pay")
  @ApiOperation({
    summary:
      "Mock: подтверждение оплаты по токену (если шлюз не настроен, ссылка ведёт сюда)",
  })
  async mockPay(
    @Query("orderId") orderId: string,
    @Query("token") token: string,
    @Res() res: Response,
  ): Promise<void> {
    const web =
      this.config.get<string>("WEB_APP_PUBLIC_URL") ?? "http://localhost:3000";
    const base = web.replace(/\/$/, "");
    try {
      await this.payment.confirmPaymentOrder(orderId, token);
      res.redirect(
        302,
        `${base}/billing/success?orderId=${encodeURIComponent(orderId)}`,
      );
    } catch {
      res.redirect(302, `${base}/billing/success?error=1`);
    }
  }

  @Post("webhook")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Callback шлюза (PAŞA Bank): body { orderId, status, signature, externalId? }",
  })
  async webhook(@Body() body: PaymentWebhookDto) {
    return this.payment.handleWebhook(body);
  }
}
