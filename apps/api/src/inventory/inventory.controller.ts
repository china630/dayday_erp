import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { UserRole } from "@dayday/database";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { requireOrgRole } from "../auth/require-org-role";
import type { AuthUser } from "../auth/types/auth-user";
import { OrganizationId } from "../common/org-id.decorator";
import { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import { CreateWarehouseBinDto } from "./dto/create-warehouse-bin.dto";
import { PatchInventorySettingsDto } from "./dto/patch-inventory-settings.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { CreateInventoryAdjustmentDto } from "./dto/create-inventory-adjustment.dto";
import { PurchaseStockDto } from "./dto/purchase-stock.dto";
import { SurplusStockDocumentDto } from "./dto/surplus-stock-document.dto";
import { TransferStockDto } from "./dto/transfer-stock.dto";
import { WriteOffStockDocumentDto } from "./dto/write-off-stock-document.dto";
import { InventoryService } from "./inventory.service";

@ApiTags("inventory")
@ApiBearerAuth("bearer")
@Controller("inventory")
@UseGuards(RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("settings")
  @ApiOperation({ summary: "Настройки склада (минус, склад по умолчанию)" })
  settings(@OrganizationId() organizationId: string) {
    return this.inventory.getInventorySettings(organizationId);
  }

  @Patch("settings")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
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
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать склад" })
  createWarehouse(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.inventory.createWarehouse(organizationId, dto);
  }

  @Get("bins")
  @ApiOperation({ summary: "Список ячеек (топология склада)" })
  bins(
    @OrganizationId() organizationId: string,
    @Query("warehouseId") warehouseId?: string,
  ) {
    return this.inventory.listBins(organizationId, warehouseId);
  }

  @Post("bins")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Создать ячейку склада" })
  createBin(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateWarehouseBinDto,
  ) {
    return this.inventory.createBin(organizationId, dto);
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
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
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
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Перемещение между складами" })
  transfer(
    @OrganizationId() organizationId: string,
    @Body() dto: TransferStockDto,
  ) {
    return this.inventory.transferStock(organizationId, dto);
  }

  @Post("adjustments")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
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

  @Post("documents/surplus")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Документ: оприходование излишков" })
  surplusDocument(
    @OrganizationId() organizationId: string,
    @Body() dto: SurplusStockDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.adjustStock(
      organizationId,
      {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        quantity: dto.quantity,
        type: "IN",
        inventoryAccountCode: dto.inventoryAccountCode,
        unitPrice: dto.unitPrice,
      },
      requireOrgRole(user),
    );
  }

  @Get("physical-adjustments")
  @ApiOperation({
    summary:
      "Список документов физической инвентаризации / актов корректировки остатков",
  })
  listPhysicalAdjustments(
    @OrganizationId() organizationId: string,
    @Query("warehouseId") warehouseId?: string,
  ) {
    return this.inventory.listInventoryAdjustments(
      organizationId,
      warehouseId || undefined,
    );
  }

  @Get("physical-adjustments/:id")
  @ApiOperation({ summary: "Документ корректировки по id" })
  getPhysicalAdjustment(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
  ) {
    return this.inventory.getInventoryAdjustment(organizationId, id);
  }

  @Post("physical-adjustments")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Черновик: ожидаемое количество из StockItem, факт из тела, delta = факт − учёт",
  })
  createPhysicalAdjustment(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateInventoryAdjustmentDto,
  ) {
    return this.inventory.createInventoryAdjustment(organizationId, dto);
  }

  @Post("physical-adjustments/:id/post")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({
    summary:
      "Провести документ: движения склада + проводки 731/201 (недостача), 201/631 (излишек); списание по FIFO",
  })
  postPhysicalAdjustment(
    @OrganizationId() organizationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.postAdjustment(
      organizationId,
      id,
      user.userId,
      requireOrgRole(user),
    );
  }

  @Post("documents/write-off")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: "Документ: списание товаров" })
  writeOffDocument(
    @OrganizationId() organizationId: string,
    @Body() dto: WriteOffStockDocumentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.adjustStock(
      organizationId,
      {
        warehouseId: dto.warehouseId,
        productId: dto.productId,
        quantity: dto.quantity,
        type: "OUT",
        inventoryAccountCode: dto.inventoryAccountCode,
      },
      requireOrgRole(user),
    );
  }
}
