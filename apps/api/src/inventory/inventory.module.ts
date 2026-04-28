import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AccessControlModule } from "../access/access-control.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StockModule } from "../stock/stock.module";
import { InventoryAuditController } from "./inventory-audit.controller";
import { InventoryAuditService } from "./inventory-audit.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [PrismaModule, AccountingModule, StockModule, AccessControlModule],
  controllers: [InventoryController, InventoryAuditController],
  providers: [InventoryService, InventoryAuditService],
  exports: [InventoryService],
})
export class InventoryModule {}
