import { Controller, Get, Query } from "@nestjs/common";
import { HEALTH_CHECK_PAYLOAD } from "./common/health-payload";
import { Public } from "./auth/decorators/public.decorator";
import {
  CbarExternalFetchDisabledError,
  CbarFxService,
} from "./fx/cbar-fx.service";

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
  @Public()
  @Get("fx/cbar/sample")
  async cbarSample(@Query("poll") poll?: string) {
    if (!this.cbar.isExternalCbarFetchEnabled()) {
      return {
        mock: true,
        message: "TAX_LOOKUP_MOCK=1 — запросы к cbar.az отключены",
      };
    }
    try {
      const usd = await this.cbar.getLatestRate("USD", new Date());
      let polled: { count: number; sample: unknown[] } | undefined;
      let pollError: string | undefined;
      if (poll === "1" || poll === "true") {
        try {
          const rates = await this.cbar.fetchRatesForDate(new Date(), {
            poll: true,
          });
          polled = { count: rates.length, sample: rates.slice(0, 5) };
        } catch (e) {
          pollError = e instanceof Error ? e.message : String(e);
        }
      }
      return { ok: true, latestUsd: usd, polled, pollError };
    } catch (e) {
      if (e instanceof CbarExternalFetchDisabledError) {
        return { mock: true, message: e.message };
      }
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: message,
        path: "/api/fx/cbar/sample",
        hint:
          "Это диагностический URL: при таймаутах/блокировке cbar.az ответ не должен быть 500. Курсы в UI идут из GET /api/fx/rates (JWT) и таблицы cbar_official_rates. Проверьте URL: cbar, не char.",
      };
    }
  }
}
