import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { AuthService } from "../auth/auth.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../auth/guards/super-admin.guard";
import type { AuthUser } from "../auth/types/auth-user";
import { AdminService } from "./admin.service";
import { AdminSubscriptionPatchDto } from "./dto/admin-subscription-patch.dto";
import {
  CreatePricingBundleDto,
  UpdatePricingBundleDto,
} from "./dto/pricing-bundle.dto";
import { PatchFoundationDto } from "./dto/patch-foundation.dto";
import { PatchPricingModulePriceDto } from "./dto/patch-pricing-module-price.dto";
import { PatchQuotaUnitPricingDto } from "./dto/patch-quota-unit-pricing.dto";
import { PatchYearlyDiscountDto } from "./dto/patch-yearly-discount.dto";
import { SetBillingPriceDto } from "./dto/set-billing-price.dto";
import { SetTierQuotasDto } from "./dto/set-tier-quotas.dto";
import { TranslationUpsertDto } from "./dto/translation-upsert.dto";
import { UpsertChartTemplateEntryDto } from "./dto/upsert-chart-template-entry.dto";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService,
  ) {}

  @Get("stats")
  @ApiOperation({ summary: "Сводная статистика платформы" })
  stats() {
    return this.admin.getStats();
  }

  /** Должен быть объявлен до GET users, иначе сегмент `users` перехватится как :userId. */
  @Get("users/:userId/organizations")
  @ApiOperation({
    summary: "Организации пользователя и подписки (супер-админ, без фильтра тенанта)",
  })
  userOrganizations(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.admin.getUserOrganizations(userId);
  }

  @Get("users")
  @ApiOperation({
    summary: "Список всех пользователей платформы (пагинация, поиск по email/имени)",
  })
  users(@Query("q") q?: string, @Query("page") pageRaw?: string, @Query("pageSize") pageSizeRaw?: string) {
    const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(pageSizeRaw ?? "20", 10) || 20),
    );
    return this.admin.listUsers(q, page, pageSize);
  }

  @Get("organizations")
  @ApiOperation({ summary: "Список организаций (пагинация, поиск по VÖEN/названию)" })
  organizations(@Query("q") q?: string, @Query("page") pageRaw?: string, @Query("pageSize") pageSizeRaw?: string) {
    const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(pageSizeRaw ?? "20", 10) || 20),
    );
    return this.admin.listOrganizations(q, page, pageSize);
  }

  @Patch("organizations/:id/subscription")
  @ApiOperation({
    summary: "Принудительное продление / блокировка / смена тарифа",
  })
  patchSubscription(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AdminSubscriptionPatchDto,
  ) {
    return this.admin.patchSubscription(id, dto);
  }

  @Get("config/billing")
  @ApiOperation({ summary: "Цены и квоты по тарифам (SystemConfig)" })
  billingConfig() {
    return this.admin.getBillingConfig();
  }

  @Patch("config/billing/price")
  @ApiOperation({ summary: "Установить цену тарифа (AZN/мес.)" })
  setPrice(@Body() dto: SetBillingPriceDto) {
    return this.admin.setBillingPrice(dto);
  }

  @Patch("config/billing/quotas")
  @ApiOperation({ summary: "Установить квоты тарифа" })
  setQuotas(@Body() dto: SetTierQuotasDto) {
    return this.admin.setTierQuotas(dto);
  }

  @Patch("config/billing/foundation")
  @ApiOperation({ summary: "Базовая цена платформы (Foundation), AZN/мес." })
  patchFoundation(@Body() dto: PatchFoundationDto) {
    return this.admin.patchFoundation(dto);
  }

  @Patch("config/billing/yearly-discount")
  @ApiOperation({ summary: "Скидка при годовой оплате (%)" })
  patchYearlyDiscount(@Body() dto: PatchYearlyDiscountDto) {
    return this.admin.patchYearlyDiscount(dto);
  }

  @Patch("config/billing/quota-pricing")
  @ApiOperation({ summary: "Цены за единицы расширения квот (блоки сотрудников, документов)" })
  patchQuotaPricing(@Body() dto: PatchQuotaUnitPricingDto) {
    return this.admin.patchQuotaUnitPricing(dto);
  }

  @Post("config/billing/seed-pricing")
  @ApiOperation({
    summary:
      "v8.9.3: сброс каталога модулей к дефолтам (Banking, Kassa, HR, Warehouse)",
  })
  seedPricingCatalog() {
    return this.admin.seedPricingCatalogDefaults();
  }

  @Patch("pricing-modules/:id")
  @ApiOperation({ summary: "Обновить цену модуля в каталоге" })
  patchPricingModule(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PatchPricingModulePriceDto,
  ) {
    return this.admin.patchPricingModulePrice(id, dto);
  }

  @Post("pricing-bundles")
  @ApiOperation({ summary: "Создать пакет (bundle) для конструктора" })
  createPricingBundle(@Body() dto: CreatePricingBundleDto) {
    return this.admin.createPricingBundle(dto);
  }

  @Patch("pricing-bundles/:id")
  @ApiOperation({ summary: "Обновить пакет" })
  updatePricingBundle(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricingBundleDto,
  ) {
    return this.admin.updatePricingBundle(id, dto);
  }

  @Delete("pricing-bundles/:id")
  @ApiOperation({ summary: "Удалить пакет" })
  deletePricingBundle(@Param("id", ParseUUIDPipe) id: string) {
    return this.admin.deletePricingBundle(id);
  }

  @Get("translations")
  @ApiOperation({
    summary:
      "Список ключей i18n: дефолты из resources + переопределения из БД",
  })
  translations(
    @Query("locale") locale = "az",
    @Query("q") q?: string,
    @Query("skip") skipRaw?: string,
    @Query("take") takeRaw?: string,
  ) {
    const skip = Math.max(0, Number.parseInt(skipRaw ?? "0", 10) || 0);
    const take = Math.min(
      50000,
      Math.max(1, Number.parseInt(takeRaw ?? "20000", 10) || 20000),
    );
    return this.admin.listTranslations(locale, q, skip, take);
  }

  @Post("translations")
  @ApiOperation({ summary: "Создать или обновить строку перевода" })
  upsertTranslation(@Body() dto: TranslationUpsertDto) {
    return this.admin.upsertTranslation(dto);
  }

  @Delete("translations/:id")
  @ApiOperation({ summary: "Удалить переопределение" })
  deleteTranslation(@Param("id", ParseUUIDPipe) id: string) {
    return this.admin.deleteTranslation(id);
  }

  @Post("translations/sync")
  @ApiOperation({
    summary: "Сбросить версию кэша i18n (клиенты перезагружают переводы)",
  })
  syncTranslations() {
    return this.admin.syncTranslationsCache();
  }

  @Get("audit-logs")
  @ApiOperation({ summary: "Глобальный журнал AuditLog" })
  auditLogs(
    @Query("organizationId") organizationId?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("skip") skipRaw?: string,
    @Query("take") takeRaw?: string,
  ) {
    const skip = Math.max(0, Number.parseInt(skipRaw ?? "0", 10) || 0);
    const take = Math.min(
      200,
      Math.max(1, Number.parseInt(takeRaw ?? "50", 10) || 50),
    );
    return this.admin.globalAuditLogs({
      organizationId,
      userId,
      from,
      to,
      skip,
      take,
    });
  }

  @Get("chart-template")
  @ApiOperation({
    summary:
      "Глобальный шаблон NAS (chart_of_accounts_entries) — источник для новых организаций",
  })
  chartTemplateList() {
    return this.admin.listChartTemplateEntries();
  }

  @Post("chart-template")
  @ApiOperation({ summary: "Создать или обновить строку глобального плана NAS" })
  chartTemplateUpsert(@Body() dto: UpsertChartTemplateEntryDto) {
    return this.admin.upsertChartTemplateEntry(dto);
  }

  @Post("impersonate/:userId")
  @ApiOperation({
    summary: "Войти от имени пользователя (поддержка); refresh — в cookie",
  })
  async impersonate(
    @CurrentUser() admin: AuthUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.auth.impersonate(admin.userId, userId);
    this.auth.setRefreshCookie(res, out.refreshToken);
    const { refreshToken: _r, ...body } = out;
    return body;
  }
}
