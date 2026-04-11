import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { SignatureService } from "./signature.service";

@ApiTags("public")
@Controller("public")
export class PublicVerifyController {
  constructor(private readonly signatures: SignatureService) {}

  @Public()
  @Get("verify/:id")
  @ApiOperation({
    summary:
      "Публичная проверка подписи по id записи DigitalSignatureLog (QR на PDF). Без внутренних UUID документов и org.",
  })
  async verify(@Param("id") id: string) {
    const data = await this.signatures.getPublicVerification(id);
    if (!data) {
      throw new NotFoundException("Signature not found or not completed");
    }
    return data;
  }
}
