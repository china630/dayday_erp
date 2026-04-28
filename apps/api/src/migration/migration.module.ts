import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OpeningBalancesController } from "./opening-balances.controller";
import { OpeningBalancesService } from "./opening-balances.service";

@Module({
  imports: [PrismaModule, AccountingModule],
  controllers: [OpeningBalancesController],
  providers: [OpeningBalancesService],
})
export class MigrationModule {}
