import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { PrismaModule } from "../prisma/prisma.module";
import { InventoryAuditController } from "./inventory-audit.controller";
import { InventoryAuditService } from "./inventory-audit.service";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [InventoryController, InventoryAuditController],
  providers: [InventoryService, InventoryAuditService],
  exports: [InventoryService],
})
export class InventoryModule {}
