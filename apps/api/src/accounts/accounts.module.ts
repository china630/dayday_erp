import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AccountMappingsController } from "./account-mappings.controller";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";

@Module({
  imports: [PrismaModule],
  controllers: [AccountsController, AccountMappingsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
