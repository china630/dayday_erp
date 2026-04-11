import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { BankingWebhookDto } from "./dto/banking-webhook.dto";
import { BankIntegrationService } from "./bank-integration.service";

@ApiTags("public")
@Controller("public/banking")
export class BankWebhookController {
  constructor(private readonly integration: BankIntegrationService) {}

  @Public()
  @Post("webhook/:secret")
  @ApiOperation({
    summary:
      "Вебхук банка: новые операции (без JWT; секрет в URL привязан к организации).",
  })
  @ApiBody({ type: BankingWebhookDto })
  async webhook(
    @Param("secret") secret: string,
    @Body() body: BankingWebhookDto,
  ) {
    return this.integration.processWebhook(secret, body);
  }
}
