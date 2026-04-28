import { Module } from "@nestjs/common";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { IfrsAutoMappingService } from "./ifrs-auto-mapping.service";
import { NettingService } from "./netting.service";

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, IfrsAutoMappingService, NettingService, RolesGuard],
  exports: [AccountingService, NettingService],
})
export class AccountingModule {}
