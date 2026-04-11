import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CbarFxService } from "./cbar-fx.service";
import { CbarRateSyncCron } from "./cbar-rate-sync.cron";
import { CbarRateSyncService } from "./cbar-rate-sync.service";
import { FxController } from "./fx.controller";
import { FxRevaluationCron } from "./fx-revaluation.cron";
import { FxRevaluationService } from "./fx-revaluation.service";

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [FxController],
  providers: [
    CbarFxService,
    CbarRateSyncService,
    CbarRateSyncCron,
    FxRevaluationService,
    FxRevaluationCron,
  ],
  exports: [CbarFxService, CbarRateSyncService, FxRevaluationService],
})
export class FxModule {}
