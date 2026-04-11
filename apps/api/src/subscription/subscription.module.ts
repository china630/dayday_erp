import { Global, Module } from "@nestjs/common";
import { AccessControlModule } from "../access/access-control.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QuotaModule } from "../quota/quota.module";
import { SubscriptionAccessService } from "./subscription-access.service";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionGuard } from "./subscription.guard";

@Global()
@Module({
  imports: [PrismaModule, QuotaModule, AccessControlModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionAccessService, SubscriptionGuard],
  exports: [SubscriptionAccessService, SubscriptionGuard],
})
export class SubscriptionModule {}
