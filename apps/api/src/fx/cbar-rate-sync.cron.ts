import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { CbarRateSyncService } from "./cbar-rate-sync.service";

/**
 * После 10:00 по Баку ЦБА обновляет XML; повторные запросы переводят PRELIMINARY → FINAL при смене Value.
 */
@Injectable()
export class CbarRateSyncCron {
  private readonly logger = new Logger(CbarRateSyncCron.name);

  constructor(private readonly sync: CbarRateSyncService) {}

  @Cron("5 10 * * *", { timeZone: "Asia/Baku" })
  async afterCbarOpen(): Promise<void> {
    await this.runSafe();
  }

  @Cron("0 12 * * *", { timeZone: "Asia/Baku" })
  async noon(): Promise<void> {
    await this.runSafe();
  }

  @Cron("0 16 * * *", { timeZone: "Asia/Baku" })
  async afternoon(): Promise<void> {
    await this.runSafe();
  }

  private async runSafe(): Promise<void> {
    try {
      await this.sync.syncTodayFromCbar();
    } catch (e) {
      this.logger.warn(
        `CBAR sync cron: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
