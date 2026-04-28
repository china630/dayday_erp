import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { IntegrationReliabilityService } from "../integrations/integration-reliability.service";
import { connectionFromRedisUrl } from "../queue/bullmq.config";

export const BANK_BALANCES_SYNC_QUEUE = "sync-bank-balances";

@Injectable()
export class BankBalancesSyncQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BankBalancesSyncQueueService.name);
  private readonly queue: Queue;

  constructor(
    config: ConfigService,
    private readonly reliability: IntegrationReliabilityService,
  ) {
    const connection = connectionFromRedisUrl(
      config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.queue = new Queue(BANK_BALANCES_SYNC_QUEUE, { connection });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.BANK_BALANCES_SYNC_DISABLED === "1") {
      this.logger.warn("BANK_BALANCES_SYNC_DISABLED=1 — balances sync queue disabled");
      return;
    }
    await this.queue.add(
      "sync_tick",
      {},
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: "bank-balances-sync-hourly",
        removeOnComplete: true,
      },
    );
    this.logger.log("BullMQ: sync-bank-balances scheduled each 60 minutes");
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async enqueueManualSync(params: {
    organizationIds: string[];
    triggeredByUserId?: string | null;
    source?: string;
    idempotencyKey?: string | null;
  }): Promise<{ queued: number }> {
    const organizationIds = Array.from(
      new Set(params.organizationIds.map((id) => id.trim()).filter(Boolean)),
    );
    if (organizationIds.length === 0) {
      return { queued: 0 };
    }
    const writeKey =
      params.idempotencyKey?.trim() ||
      createHash("sha256")
        .update(JSON.stringify({ organizationIds, source: params.source ?? "manual" }))
        .digest("hex")
        .slice(0, 32);
    await this.reliability.executeWithPolicies({
      provider: "banking_manual_sync",
      operation: "enqueue",
      writeIdempotencyKey: writeKey,
      request: async () => Promise.resolve({ ok: true }),
    });

    await this.queue.add(
      "manual_sync",
      {
        organizationIds,
        triggeredByUserId: params.triggeredByUserId ?? null,
        source: params.source ?? "manual",
        idempotencyKey: writeKey,
      },
      {
        removeOnComplete: true,
      },
    );
    return { queued: organizationIds.length };
  }
}

