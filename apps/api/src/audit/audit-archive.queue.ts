import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";

export const AUDIT_ARCHIVE_QUEUE = "audit-archive";

@Injectable()
export class AuditArchiveQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditArchiveQueueService.name);
  private readonly queue: Queue;

  constructor(config: ConfigService) {
    const connection = connectionFromRedisUrl(
      config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.queue = new Queue(AUDIT_ARCHIVE_QUEUE, { connection });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.AUDIT_ARCHIVE_DISABLED === "1") {
      this.logger.warn("AUDIT_ARCHIVE_DISABLED=1 — cron архивации аудита выключен");
      return;
    }
    await this.queue.add(
      "monthly_archive",
      {},
      {
        repeat: { pattern: "0 0 1 * *" },
        jobId: "audit-archive-monthly",
        removeOnComplete: true,
      },
    );
    this.logger.log(
      "BullMQ: ежемесячная архивация audit_logs (1-го числа 00:00 UTC, cron 0 0 1 * *)",
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
