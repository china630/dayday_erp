import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ManufacturingController } from "./manufacturing.controller";
import { ManufacturingService } from "./manufacturing.service";

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [ManufacturingController],
  providers: [ManufacturingService],
})
export class ManufacturingModule {}
