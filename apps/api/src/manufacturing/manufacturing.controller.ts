import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { OrganizationId } from "../common/org-id.decorator";
import { ReleaseProductionDto } from "./dto/release-production.dto";
import { UpsertRecipeDto } from "./dto/upsert-recipe.dto";
import { ManufacturingService } from "./manufacturing.service";
import { RequiresModule } from "../subscription/requires-module.decorator";
import { SubscriptionGuard } from "../subscription/subscription.guard";
import { ModuleEntitlement } from "../subscription/subscription.constants";

@ApiTags("manufacturing")
@ApiBearerAuth("bearer")
@UseGuards(SubscriptionGuard)
@RequiresModule(ModuleEntitlement.MANUFACTURING)
@Controller("manufacturing")
export class ManufacturingController {
  constructor(private readonly mfg: ManufacturingService) {}

  @Get("recipes")
  @ApiOperation({ summary: "Список спецификаций" })
  listRecipes(@OrganizationId() organizationId: string) {
    return this.mfg.listRecipes(organizationId);
  }

  @Get("recipes/by-product/:finishedProductId")
  @ApiOperation({ summary: "Спецификация по готовому продукту" })
  getRecipe(
    @OrganizationId() organizationId: string,
    @Param("finishedProductId") finishedProductId: string,
  ) {
    return this.mfg.getRecipeByFinishedProduct(organizationId, finishedProductId);
  }

  @Put("recipes")
  @ApiOperation({ summary: "Создать/заменить спецификацию" })
  upsertRecipe(
    @OrganizationId() organizationId: string,
    @Body() dto: UpsertRecipeDto,
  ) {
    return this.mfg.upsertRecipe(organizationId, dto);
  }

  @Delete("recipes/:finishedProductId")
  @ApiOperation({ summary: "Удалить спецификацию" })
  deleteRecipe(
    @OrganizationId() organizationId: string,
    @Param("finishedProductId") finishedProductId: string,
  ) {
    return this.mfg.deleteRecipe(organizationId, finishedProductId);
  }

  @Post("release")
  @ApiOperation({
    summary: "Выпуск продукции: списание компонентов (Дт 204 — Кт 201) по средней",
  })
  release(
    @OrganizationId() organizationId: string,
    @Body() dto: ReleaseProductionDto,
  ) {
    return this.mfg.releaseProduction(organizationId, dto);
  }
}
