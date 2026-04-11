import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Worker } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";
import { BankIntegrationService } from "./bank-integration.service";
import { BANK_DIRECT_SYNC_QUEUE } from "./bank-sync.queue";

@Injectable()
export class BankDirectSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BankDirectSyncWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly integration: BankIntegrationService,
  ) {}

  onModuleInit(): void {
    if (process.env.BANK_DIRECT_SYNC_DISABLED === "1") {
      this.logger.warn("BANK_DIRECT_SYNC_DISABLED=1 — worker не запущен");
      return;
    }
    const connection = connectionFromRedisUrl(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.worker = new Worker(
      BANK_DIRECT_SYNC_QUEUE,
      async (job: Job) => this.handle(job),
      { connection },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err?.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async handle(job: Job): Promise<void> {
    if (job.name !== "hourly_tick") {
      this.logger.warn(`Unknown job ${job.name}`);
      return;
    }
    await this.integration.runHourlySyncAllOrganizations();
  }
}
