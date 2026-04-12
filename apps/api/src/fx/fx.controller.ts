import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CbarRateSyncService } from "./cbar-rate-sync.service";
import type { FxDashboardRateRow } from "./fx-dashboard.types";

export type { FxDashboardRateRow };

@ApiTags("fx")
@ApiBearerAuth("bearer")
@Controller("fx")
export class FxController {
  constructor(private readonly rateSync: CbarRateSyncService) {}

  @Get("rates")
  @ApiOperation({
    summary:
      "Курсы к AZN (USD, EUR, GBP, RUB, CNY, TRY, JPY); из БД, при отсутствии — один запрос к ЦБА на весь набор",
  })
  async rates(): Promise<{
    rates: FxDashboardRateRow[];
    isFallback: boolean;
  }> {
    return this.rateSync.resolveDashboardRates(new Date());
  }
}
