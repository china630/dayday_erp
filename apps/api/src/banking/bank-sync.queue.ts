import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";

export const BANK_DIRECT_SYNC_QUEUE = "bank-direct-sync";

@Injectable()
export class BankDirectSyncQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BankDirectSyncQueueService.name);
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    const connection = connectionFromRedisUrl(
      config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.queue = new Queue(BANK_DIRECT_SYNC_QUEUE, { connection });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.BANK_DIRECT_SYNC_DISABLED === "1") {
      this.logger.warn("BANK_DIRECT_SYNC_DISABLED=1 — часовой опрос банков выключен");
      return;
    }
    await this.queue.add(
      "hourly_tick",
      {},
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: "bank-direct-hourly-tick",
        removeOnComplete: true,
      },
    );
    this.logger.log("BullMQ: повторяемая задача bank-direct-sync каждые 60 мин");
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
