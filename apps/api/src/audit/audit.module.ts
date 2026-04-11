import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditArchiveQueueService } from "./audit-archive.queue";
import { AuditArchiveWorker } from "./audit-archive.worker";
import { AuditController } from "./audit.controller";
import { AuditMutationInterceptor } from "./audit-mutation.interceptor";
import { AuditService } from "./audit.service";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditArchiveQueueService,
    AuditArchiveWorker,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditMutationInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
