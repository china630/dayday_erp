import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { TenantPrismaRawService } from "./tenant-prisma-raw.service";

@Global()
@Module({
  providers: [PrismaService, TenantPrismaRawService],
  exports: [PrismaService, TenantPrismaRawService],
})
export class PrismaModule {}
