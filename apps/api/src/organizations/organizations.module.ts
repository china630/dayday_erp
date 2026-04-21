import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { AccessControlModule } from "../access/access-control.module";
import { FxModule } from "../fx/fx.module";
import { GlobalCompanyDirectoryModule } from "../global-directory/global-company-directory.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportingModule } from "../reporting/reporting.module";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { HoldingsController } from "./holdings.controller";
import { HoldingsReportingService } from "./holdings-reporting.service";
import { HoldingsService } from "./holdings.service";
import { OrganizationSettingsController } from "./organization-settings.controller";
import { OrganizationSettingsService } from "./organization-settings.service";

@Module({
  imports: [
    PrismaModule,
    AccountsModule,
    AccessControlModule,
    ReportingModule,
    FxModule,
    GlobalCompanyDirectoryModule,
  ],
  controllers: [
    OrganizationsController,
    HoldingsController,
    OrganizationSettingsController,
  ],
  providers: [
    OrganizationsService,
    HoldingsService,
    HoldingsReportingService,
    OrganizationSettingsService,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
