import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditArchiveQueueService } from "./audit-archive.queue";
import { AuditArchiveWorker } from "./audit-archive.worker";
import { AuditController } from "./audit.controller";
import { AuditMutationInterceptor } from "./audit-mutation.interceptor";
import { DataMaskingService } from "../privacy/data-masking.service";
import { AuditService } from "./audit.service";
import { AuditChainCronService } from "./audit-chain-cron.service";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AuditController],
  providers: [
    DataMaskingService,
    AuditService,
    AuditChainCronService,
    AuditArchiveQueueService,
    AuditArchiveWorker,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditMutationInterceptor,
    },
  ],
  exports: [AuditService, DataMaskingService],
})
export class AuditModule {}
