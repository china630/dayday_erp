import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access/access-control.module";
import { FxModule } from "../fx/fx.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportingModule } from "../reporting/reporting.module";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { HoldingsController } from "./holdings.controller";
import { HoldingsReportingService } from "./holdings-reporting.service";
import { HoldingsService } from "./holdings.service";

@Module({
  imports: [PrismaModule, AccessControlModule, ReportingModule, FxModule],
  controllers: [OrganizationsController, HoldingsController],
  providers: [OrganizationsService, HoldingsService, HoldingsReportingService],
})
export class OrganizationsModule {}
