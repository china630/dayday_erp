import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Worker } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";
import { runWithTenantContextAsync } from "../prisma/tenant-context";
import { PayrollService } from "./payroll.service";
import {
  PAYROLL_HEAVY_QUEUE,
  type PayrollHeavyJobPayload,
} from "./payroll-heavy.queue";

@Injectable()
export class PayrollHeavyWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayrollHeavyWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly payroll: PayrollService,
  ) {}

  onModuleInit(): void {
    if (process.env.PAYROLL_HEAVY_DISABLED === "1") {
      this.logger.warn("PAYROLL_HEAVY_DISABLED=1 — worker зарплаты выключен");
      return;
    }
    const connection = connectionFromRedisUrl(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.worker = new Worker<PayrollHeavyJobPayload>(
      PAYROLL_HEAVY_QUEUE,
      async (job: Job<PayrollHeavyJobPayload>) => this.handle(job),
      { connection },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err?.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async handle(job: Job<PayrollHeavyJobPayload>): Promise<unknown> {
    const data = job.data;
    return runWithTenantContextAsync(
      { organizationId: data.organizationId, skipTenantFilter: false },
      async () => {
        if (data.kind === "draft") {
          return this.payroll.createDraftRunSync(data.organizationId, data.dto);
        }
        return this.payroll.postRunSync(data.organizationId, data.runId);
      },
    );
  }
}
