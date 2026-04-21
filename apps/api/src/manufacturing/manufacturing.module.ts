import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StockModule } from "../stock/stock.module";
import { ManufacturingController } from "./manufacturing.controller";
import { ManufacturingService } from "./manufacturing.service";

@Module({
  imports: [PrismaModule, AccountingModule, StockModule],
  controllers: [ManufacturingController],
  providers: [ManufacturingService],
})
export class ManufacturingModule {}
