import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";
import type { CreatePayrollRunDto } from "./dto/create-payroll-run.dto";

export const PAYROLL_HEAVY_QUEUE = "payroll-heavy";

export type PayrollHeavyJobPayload =
  | {
      kind: "draft";
      organizationId: string;
      dto: CreatePayrollRunDto;
    }
  | {
      kind: "post";
      organizationId: string;
      runId: string;
    };

@Injectable()
export class PayrollHeavyQueueService implements OnModuleDestroy {
  private readonly queue: Queue<PayrollHeavyJobPayload>;

  constructor(config: ConfigService) {
    const connection = connectionFromRedisUrl(
      config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.queue = new Queue<PayrollHeavyJobPayload>(PAYROLL_HEAVY_QUEUE, {
      connection,
    });
  }

  async enqueueDraft(
    organizationId: string,
    dto: CreatePayrollRunDto,
  ): Promise<string> {
    const job = await this.queue.add(
      "draft_run",
      { kind: "draft", organizationId, dto },
      { removeOnComplete: 50, removeOnFail: 20, attempts: 2 },
    );
    return String(job.id);
  }

  async enqueuePost(organizationId: string, runId: string): Promise<string> {
    const job = await this.queue.add(
      "post_run",
      { kind: "post", organizationId, runId },
      { removeOnComplete: 50, removeOnFail: 20, attempts: 2 },
    );
    return String(job.id);
  }

  async getJobState(jobId: string): Promise<{
    id: string;
    state: string;
    progress: unknown;
    failedReason?: string;
    returnvalue?: unknown;
  } | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      id: job.id!,
      state,
      progress: job.progress,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
