import { Controller, Get, Query } from "@nestjs/common";
import { HEALTH_CHECK_PAYLOAD } from "./common/health-payload";
import { Public } from "./auth/decorators/public.decorator";
import { CbarFxService } from "./fx/cbar-fx.service";

@Controller()
export class AppController {
  constructor(private readonly cbar: CbarFxService) {}

  @Public()
  @Get("health")
  health() {
    return HEALTH_CHECK_PAYLOAD;
  }

  /**
   * getLatestRate — при отсутствии курса на «сегодня» вернёт вчера.
   * ?poll=1 — дополнительно ждать обновления XML (до CBAR_POLL_MAX_MS, не для прода в HTTP).
   */
  @Get("fx/cbar/sample")
  async cbarSample(@Query("poll") poll?: string) {
    if (!this.cbar.isExternalCbarFetchEnabled()) {
      return {
        mock: true,
        message: "TAX_LOOKUP_MOCK=1 — запросы к cbar.az отключены",
      };
    }
    const usd = await this.cbar.getLatestRate("USD", new Date());
    let polled: { count: number; sample: unknown[] } | undefined;
    if (poll === "1" || poll === "true") {
      const rates = await this.cbar.fetchRatesForDate(new Date(), { poll: true });
      polled = { count: rates.length, sample: rates.slice(0, 5) };
    }
    return { latestUsd: usd, polled };
  }
}
