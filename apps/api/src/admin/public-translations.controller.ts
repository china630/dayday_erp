import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { AdminService } from "./admin.service";

@ApiTags("public-translations")
@Public()
@Controller("public/translations")
export class PublicTranslationsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ApiOperation({
    summary: "Переопределения i18n из БД для слияния с resources на клиенте",
  })
  async list(@Query("locale") locale = "az") {
    const loc = (locale || "az").trim().toLowerCase();
    const [overrides, cacheVersion] = await Promise.all([
      this.admin.publicTranslationsFlat(loc),
      this.admin.getTranslationCacheVersion(),
    ]);
    return { locale: loc, overrides, cacheVersion };
  }
}
