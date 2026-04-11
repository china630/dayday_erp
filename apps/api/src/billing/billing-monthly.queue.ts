import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";

export const BILLING_MONTHLY_QUEUE = "billing-monthly";

@Injectable()
export class BillingMonthlyQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingMonthlyQueueService.name);
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    const connection = connectionFromRedisUrl(
      config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.queue = new Queue(BILLING_MONTHLY_QUEUE, { connection });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.BILLING_MONTHLY_DISABLED === "1") {
      this.logger.warn(
        "BILLING_MONTHLY_DISABLED=1 — ежемесячное начисление подписки выключено",
      );
      return;
    }
    await this.queue.add(
      "monthly_subscription_invoices",
      {},
      {
        repeat: { pattern: "0 0 1 * *" },
        jobId: "billing-monthly-subscription",
        removeOnComplete: true,
      },
    );
    this.logger.log(
      "BullMQ: ежемесячные SubscriptionInvoice (1-го числа 00:00 UTC, cron 0 0 1 * *)",
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
