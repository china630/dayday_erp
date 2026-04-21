import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { GlobalCompanyDirectoryService } from "./global-company-directory.service";

@Module({
  imports: [PrismaModule],
  providers: [GlobalCompanyDirectoryService],
  exports: [GlobalCompanyDirectoryService],
})
export class GlobalCompanyDirectoryModule {}
