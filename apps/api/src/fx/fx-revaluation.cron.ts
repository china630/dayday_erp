import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { FxRevaluationService } from "./fx-revaluation.service";

/**
 * 1-е число 00:40 UTC — переоценка за предыдущий месяц (дата курса — последний день того месяца, календарь Baku).
 */
@Injectable()
export class FxRevaluationCron {
  private readonly logger = new Logger(FxRevaluationCron.name);

  constructor(private readonly fx: FxRevaluationService) {}

  @Cron("40 0 1 * *")
  async onFirstOfMonth(): Promise<void> {
    this.logger.log("FX month-end revaluation started");
    await this.fx.runMonthEndForAllOrganizations();
    this.logger.log("FX month-end revaluation finished");
  }
}
