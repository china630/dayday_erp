import { Controller, Get, Logger } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CbarLatestRate } from "./cbar-fx.service";
import { CbarFxService } from "./cbar-fx.service";
import { CbarRateSyncService } from "./cbar-rate-sync.service";

/** Топ валют для дашборда: AZN за 1 единицу (официальный курс ЦБА). */
const DASHBOARD_FX_CODES = [
  "USD",
  "EUR",
  "GBP",
  "RUB",
  "CNY",
  "TRY",
  "JPY",
] as const;

export type FxDashboardRateRow = {
  currencyCode: string;
  rate: number | null;
  value: number | null;
  nominal: number | null;
  rateDateBaku: string | null;
  isFallback: boolean;
  /** Нет ни live, ни строки в cbar_official_rates — в UI показать «—». */
  isUnavailable: boolean;
};

@ApiTags("fx")
@ApiBearerAuth("bearer")
@Controller("fx")
export class FxController {
  private readonly logger = new Logger(FxController.name);

  constructor(
    private readonly cbar: CbarFxService,
    private readonly rateSync: CbarRateSyncService,
  ) {}

  @Get("rates")
  @ApiOperation({
    summary:
      "Курсы к AZN (USD, EUR, GBP, RUB, CNY, TRY, JPY); при сбое live — последние из БД или прочерк",
  })
  async rates(): Promise<{
    rates: FxDashboardRateRow[];
    isFallback: boolean;
  }> {
    const now = new Date();
    const rates: FxDashboardRateRow[] = [];
    let anyFallback = false;

    for (const code of DASHBOARD_FX_CODES) {
      try {
        const live: CbarLatestRate = await this.cbar.getLatestRate(code, now);
        rates.push({
          currencyCode: live.currencyCode,
          rate: live.rate,
          value: live.value,
          nominal: live.nominal,
          rateDateBaku: live.rateDateBaku,
          isFallback: live.isFallback,
          isUnavailable: false,
        });
        if (live.isFallback) anyFallback = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`CBAR live failed for ${code}: ${msg}`);
        const cached = await this.rateSync.getLatestFromDbForCode(code);
        if (cached) {
          rates.push({
            currencyCode: cached.currencyCode,
            rate: cached.rate,
            value: cached.value,
            nominal: cached.nominal,
            rateDateBaku: cached.rateDateBaku,
            isFallback: true,
            isUnavailable: false,
          });
          anyFallback = true;
        } else {
          rates.push({
            currencyCode: code,
            rate: null,
            value: null,
            nominal: null,
            rateDateBaku: null,
            isFallback: true,
            isUnavailable: true,
          });
          anyFallback = true;
        }
      }
    }

    if (rates.length !== DASHBOARD_FX_CODES.length) {
      this.logger.warn(
        `FX dashboard: expected ${DASHBOARD_FX_CODES.length} rates, got ${rates.length}`,
      );
    }

    const ordered = DASHBOARD_FX_CODES.map((code) => {
      const row = rates.find((r) => r.currencyCode === code);
      return (
        row ?? {
          currencyCode: code,
          rate: null,
          value: null,
          nominal: null,
          rateDateBaku: null,
          isFallback: true,
          isUnavailable: true,
        }
      );
    });

    return { rates: ordered, isFallback: anyFallback };
  }
}
