import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Worker } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";
import { BILLING_MONTHLY_QUEUE } from "./billing-monthly.queue";
import { BillingMonthlyService } from "./billing-monthly.service";

@Injectable()
export class BillingMonthlyWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingMonthlyWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly billingMonthly: BillingMonthlyService,
  ) {}

  onModuleInit(): void {
    if (process.env.BILLING_MONTHLY_DISABLED === "1") {
      this.logger.warn(
        "BILLING_MONTHLY_DISABLED=1 — worker ежемесячного биллинга не запущен",
      );
      return;
    }
    const connection = connectionFromRedisUrl(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.worker = new Worker(
      BILLING_MONTHLY_QUEUE,
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
    if (job.name !== "monthly_subscription_invoices") {
      return;
    }
    await this.billingMonthly.runMonthlyBilling(new Date());
  }
}
