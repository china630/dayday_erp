import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { OrganizationId } from "../common/org-id.decorator";
import { CreateFixedAssetDto } from "./dto/create-fixed-asset.dto";
import { RunMonthlyDepreciationDto } from "./dto/run-monthly-depreciation.dto";
import { UpdateFixedAssetDto } from "./dto/update-fixed-asset.dto";
import { FixedAssetsService } from "./fixed-assets.service";
import { RequiresModule } from "../subscription/requires-module.decorator";
import { SubscriptionGuard } from "../subscription/subscription.guard";
import { ModuleEntitlement } from "../subscription/subscription.constants";

@ApiTags("fixed-assets")
@ApiBearerAuth("bearer")
@UseGuards(SubscriptionGuard)
@RequiresModule(ModuleEntitlement.FIXED_ASSETS)
@Controller("fixed-assets")
export class FixedAssetsController {
  constructor(private readonly assets: FixedAssetsService) {}

  @Get()
  @ApiOperation({ summary: "Список основных средств" })
  list(@OrganizationId() organizationId: string) {
    return this.assets.list(organizationId);
  }

  @Get(":id")
  @ApiOperation({ summary: "ОС по id" })
  getOne(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.assets.getOne(organizationId, id);
  }

  @Post()
  @ApiOperation({ summary: "Создать ОС" })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateFixedAssetDto,
  ) {
    return this.assets.create(organizationId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить ОС" })
  update(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @Body() dto: UpdateFixedAssetDto,
  ) {
    return this.assets.update(organizationId, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Удалить ОС" })
  remove(@OrganizationId() organizationId: string, @Param("id") id: string) {
    return this.assets.remove(organizationId, id);
  }

  @Post("depreciation/run")
  @ApiOperation({
    summary:
      "Запустить амортизацию за месяц (линейный метод; проводка Дт 713 — Кт 112; идемпотентно)",
  })
  runMonthlyDepreciation(
    @OrganizationId() organizationId: string,
    @Body() dto: RunMonthlyDepreciationDto,
  ) {
    return this.assets.runMonthlyDepreciation(organizationId, {
      year: dto.year,
      month: dto.month,
    });
  }
}
