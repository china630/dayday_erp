import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@dayday/database";
import { Job, Worker } from "bullmq";
import { connectionFromRedisUrl } from "../queue/bullmq.config";
import { PrismaService } from "../prisma/prisma.service";
import { runWithTenantContextAsync } from "../prisma/tenant-context";
import { AUDIT_ARCHIVE_QUEUE } from "./audit-archive.queue";

@Injectable()
export class AuditArchiveWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditArchiveWorker.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    if (process.env.AUDIT_ARCHIVE_DISABLED === "1") {
      this.logger.warn("AUDIT_ARCHIVE_DISABLED=1 — worker архивации аудита не запущен");
      return;
    }
    const connection = connectionFromRedisUrl(
      this.config.get<string>("REDIS_URL", "redis://127.0.0.1:6379"),
    );
    this.worker = new Worker(
      AUDIT_ARCHIVE_QUEUE,
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
    if (job.name !== "monthly_archive") {
      return;
    }
    await runWithTenantContextAsync(
      { organizationId: null, skipTenantFilter: true },
      async () => {
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 1);
        let moved = 0;
        for (;;) {
          const batch = await this.prisma.auditLog.findMany({
            where: { createdAt: { lt: cutoff } },
            take: 200,
            orderBy: { createdAt: "asc" },
          });
          if (batch.length === 0) {
            break;
          }
          for (const row of batch) {
            await this.prisma.$transaction(async (tx) => {
              await tx.auditLogArchive.create({
                data: {
                  organizationId: row.organizationId,
                  userId: row.userId,
                  entityType: row.entityType,
                  entityId: row.entityId,
                  action: row.action,
                  changes: row.changes as Prisma.InputJsonValue,
                  oldValues: row.oldValues as Prisma.InputJsonValue,
                  newValues: row.newValues as Prisma.InputJsonValue,
                  clientIp: row.clientIp,
                  userAgent: row.userAgent,
                  hash: row.hash,
                  createdAt: row.createdAt,
                },
              });
              await tx.auditLog.delete({ where: { id: row.id } });
            });
            moved++;
          }
        }
        this.logger.log(
          `Audit archive: перенесено ${moved} записей старше ${cutoff.toISOString()}`,
        );
      },
    );
  }
}
