import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SystemConfigModule } from "../system-config/system-config.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PricingService } from "./pricing.service";
import { PublicTranslationsController } from "./public-translations.controller";

@Module({
  imports: [PrismaModule, SystemConfigModule, AuthModule],
  controllers: [AdminController, PublicTranslationsController],
  providers: [AdminService, PricingService],
  exports: [AdminService, PricingService],
})
export class AdminModule {}
