import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DepreciationService } from "./depreciation.service";
import { FixedAssetsController } from "./fixed-assets.controller";
import { FixedAssetsService } from "./fixed-assets.service";

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, DepreciationService],
  exports: [DepreciationService],
})
export class FixedAssetsModule {}
