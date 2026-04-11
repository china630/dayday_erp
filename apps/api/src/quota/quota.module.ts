import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SystemConfigModule } from "../system-config/system-config.module";
import { QuotaService } from "./quota.service";

@Global()
@Module({
  imports: [PrismaModule, SystemConfigModule],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
