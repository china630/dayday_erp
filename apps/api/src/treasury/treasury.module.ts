import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TreasuryController } from "./treasury.controller";
import { TreasuryService } from "./treasury.service";

@Module({
  imports: [PrismaModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
