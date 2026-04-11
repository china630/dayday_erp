import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access/access-control.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [PrismaModule, AccessControlModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
