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
    description:
      "Возвращает плоский объект overrides и cacheVersion. Полный словарь — статический бандл apps/web/lib/i18n/resources.ts; клиент подмешивает overrides поверх него (глубокое слияние). Не заменяет resources.ts целиком. Избегайте ключей-родителей (например banking.cash как строка), иначе затрутся вложенные banking.cash.*.",
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
