import { Global, Module } from "@nestjs/common";
import { QuotaGuard } from "../common/guards/quota.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { SystemConfigModule } from "../system-config/system-config.module";
import { QuotaService } from "./quota.service";

@Global()
@Module({
  imports: [PrismaModule, SystemConfigModule],
  providers: [QuotaService, QuotaGuard],
  exports: [QuotaService, QuotaGuard],
})
export class QuotaModule {}
