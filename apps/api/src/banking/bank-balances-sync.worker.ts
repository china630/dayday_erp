import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { connectionFromRedisUrl } from "../queue/bullmq.config";
import { AuditService } from "../audit/audit.service";
import { BankingGatewayService } from "./banking-gateway.service";
import { BANK_BALANCES_SYNC_QUEUE } from "./bank-balances-sync.queue";

@Injectable()
export class BankBalancesSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BankBalancesSyncWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly gateway: BankingGatewayService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    if (process.env.BANK_BALANCES_SYNC_DISABLED === "1") {
      this.logger.warn("BANK_BALANCES_SYNC_DISABLED=1 — worker not started");
      return;
    }
    const connection = connectionFromRedisUrl(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.worker = new Worker(
      BANK_BALANCES_SYNC_QUEUE,
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
    if (job.name === "sync_tick") {
      const organizations = await this.prisma.organization.findMany({
        select: { id: true },
      });
      await this.syncOrganizations(organizations.map((o) => o.id));
      return;
    }
    if (job.name === "manual_sync") {
      const raw = job.data as { organizationIds?: unknown };
      const ids = Array.isArray(raw.organizationIds)
        ? raw.organizationIds.filter((v): v is string => typeof v === "string")
        : [];
      await this.syncOrganizations(ids);
      return;
    }
    if (job.name !== "sync_tick") {
      this.logger.warn(`Unknown job ${job.name}`);
      return;
    }
  }

  private async syncOrganizations(organizationIds: string[]): Promise<void> {
    for (const organizationId of organizationIds) {
      try {
        const balances = await this.gateway.getBalances(organizationId);
        await this.audit.logOrganizationSystemEvent({
          organizationId,
          entityType: "banking.sync_balances",
          entityId: organizationId,
          action: "SYNC",
          payload: {
            providers: balances.providers.map((item) => item.provider),
            accountsCount: balances.balances.length,
            details: balances.providers.map((item) => ({
              provider: item.provider,
              accountsCount: item.balances.length,
            })),
          },
        });
      } catch (error) {
        this.logger.warn(
          `sync-bank-balances org=${organizationId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

