import { Body, Controller, Get, Patch, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { OrganizationId } from "../common/org-id.decorator";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { PatchInventorySettingsDto } from "./dto/patch-inventory-settings.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { PurchaseStockDto } from "./dto/purchase-stock.dto";
import { TransferStockDto } from "./dto/transfer-stock.dto";
import { InventoryService } from "./inventory.service";

@ApiTags("inventory")
@ApiBearerAuth("bearer")
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("settings")
  @ApiOperation({ summary: "Настройки склада (минус, склад по умолчанию)" })
  settings(@OrganizationId() organizationId: string) {
    return this.inventory.getInventorySettings(organizationId);
  }

  @Patch("settings")
  @ApiOperation({ summary: "Обновить настройки склада в organization.settings" })
  patchSettings(
    @OrganizationId() organizationId: string,
    @Body() dto: PatchInventorySettingsDto,
  ) {
    return this.inventory.patchInventorySettings(organizationId, dto);
  }

  @Get("warehouses")
  warehouses(@OrganizationId() organizationId: string) {
    return this.inventory.listWarehouses(organizationId);
  }

  @Post("warehouses")
  @ApiOperation({ summary: "Создать склад" })
  createWarehouse(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.inventory.createWarehouse(organizationId, dto);
  }

  @Get("stock")
  @ApiOperation({ summary: "Остатки по складам" })
  stock(
    @OrganizationId() organizationId: string,
    @Query("warehouseId") warehouseId?: string,
  ) {
    return this.inventory.listStock(organizationId, warehouseId);
  }

  @Get("movements")
  @ApiOperation({ summary: "История движений" })
  movements(
    @OrganizationId() organizationId: string,
    @Query("warehouseId") warehouseId?: string,
    @Query("productId") productId?: string,
    @Query("take") take?: string,
  ) {
    return this.inventory.listMovements(organizationId, {
      warehouseId: warehouseId || undefined,
      productId: productId || undefined,
      take: take ? Number.parseInt(take, 10) : undefined,
    });
  }

  @Post("purchase")
  @ApiOperation({
    summary: "Закупка: приход на склад + Дт 201 Кт 531 (в одной транзакции)",
  })
  purchase(
    @OrganizationId() organizationId: string,
    @Body() dto: PurchaseStockDto,
  ) {
    return this.inventory.recordPurchase(organizationId, dto);
  }

  @Post("transfer")
  @ApiOperation({ summary: "Перемещение между складами" })
  transfer(
    @OrganizationId() organizationId: string,
    @Body() dto: TransferStockDto,
  ) {
    return this.inventory.transferStock(organizationId, dto);
  }

  @Post("adjustments")
  @ApiOperation({
    summary:
      "Корректировка: списание (Дт 731 — Кт 201/204) или оприходование (Дт 201/204 — Кт 631)",
  })
  adjustments(
    @OrganizationId() organizationId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.adjustStock(organizationId, dto, requireOrgRole(user));
  }
}
