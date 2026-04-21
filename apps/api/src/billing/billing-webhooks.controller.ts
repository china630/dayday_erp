import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentWebhookDto } from "./dto/payment-webhook.dto";
import { PaymentProviderService } from "./payment-provider.service";

const SUPPORTED_PROVIDERS = new Set(["mock", "pasha", "pasha_bank"]);

@ApiTags("billing-webhooks")
@Public()
@Controller("billing/webhooks")
export class BillingWebhooksController {
  constructor(private readonly payment: PaymentProviderService) {}

  @Post(":provider")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Payment provider webhook: verifies HMAC signature, updates PaymentOrder idempotently, extends subscription, platform audit (TZ §14.8.8).",
  })
  async receive(
    @Param("provider") provider: string,
    @Body() body: PaymentWebhookDto,
  ) {
    const p = provider.trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.has(p)) {
      throw new BadRequestException("Unknown payment provider");
    }
    return this.payment.handleWebhook(body);
  }
}
